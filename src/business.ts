import type { MetasConfig, EstatisticaCostureiro } from './types';

/**
 * Regras de negócio — RÉPLICA EXATA da aba "Bonificação" da planilha original.
 *
 * Fórmulas reais descobertas analisando o arquivo março2.xlsx:
 *
 *   Bonificação Geral  $ = (Eficiência_Geral_do_Mês - 0,75) × 20 × (100/2)
 *   Bonificação Indiv. $ = (Eficiência_Individual    - 0,75) × 20 × (100/2)
 *   Bonificação Final  $ = SUMIF(>0)  ← soma SOMENTE valores positivos
 *
 * Constantes da planilha (configuráveis via tabela `metas_config`):
 *   - eficiencia_minima       = 0,75 (75%)  → AG5
 *   - bonus_real_por_percent  = 20         → AJ4
 *
 * Observações importantes:
 *   - A "Bonificação Geral" é AUTOMÁTICA, não editável: vem da eficiência geral
 *     do mês (AG8 da planilha). A planilha tem um campo manual para o admin
 *     informar essa eficiência geral.
 *   - Se a eficiência (geral ou individual) for menor que 75%, o componente
 *     correspondente fica negativo e é descartado pelo SUMIF (vira 0).
 *   - A regra é simétrica: ambos componentes podem entrar ou ficar 0.
 *   - Eficiência é calculada como D197/D195 = minutos_efetivos / minutos_disponíveis,
 *     o que no nosso modelo equivale a `total_minutos_produzidos / total_minutos_trabalhados`.
 */

export interface StatsRaw {
  costureiro_id: number;
  nome: string;
  tipo_maquina: string;
  total_producao: number;            // SUM(quantidade_produzida)
  total_minutos_trabalhados: number; // SUM(minutos_trabalhados) = D195 (disponível)
  total_minutos_produzidos: number;  // SUM(qtd × tempo_padrao) = D197 (efetivo)
  total_minutos_produzidos_ponderados: number; // legado (não usado)
  dias_trabalhados: number;
  retrabalho_total: number;
  total_registros: number;
}

/* ────────────────────────────────────────────────────────────
 * Constantes da fórmula (espelham a planilha)
 * ──────────────────────────────────────────────────────────── */

/** Limiar mínimo de eficiência para a fórmula (AG5 da planilha) */
export const EFICIENCIA_MIN_BONIFICACAO = 75; // %

/** Real por ponto percentual (AJ4 da planilha) */
export const REAL_POR_PERCENT = 20;

/** Multiplicador final (100/2 = 50, fixo na planilha) */
export const MULTIPLICADOR_FINAL = 50;

/* ────────────────────────────────────────────────────────────
 * Cálculo dos componentes
 * ──────────────────────────────────────────────────────────── */

/**
 * Calcula o componente da bonificação a partir de uma eficiência (em %).
 *
 *   componente = (eficiencia - 0,75) × 20 × 50
 *
 * Pode dar negativo. O chamador decide se descarta (regra SUMIF da planilha).
 *
 * @param eficienciaPct  eficiência em pontos percentuais (ex.: 78 = 78%)
 */
export function calcularComponenteBonificacao(eficienciaPct: number): number {
  if (!Number.isFinite(eficienciaPct)) return 0;
  // Replica EXATAMENTE a fórmula da planilha: ((eficiencia/100 - 0,75) × 20) × 100/2
  const eficienciaDecimal = eficienciaPct / 100;
  const limiarDecimal = EFICIENCIA_MIN_BONIFICACAO / 100; // 0,75
  const valor = (eficienciaDecimal - limiarDecimal) * REAL_POR_PERCENT * MULTIPLICADOR_FINAL;
  return Math.round(valor * 10000) / 10000; // 4 casas (igual ao Excel) — arredonda 2 só na exibição
}

/**
 * Bonificação Individual = componente individual (positivo ou 0).
 * Apenas o SUMIF(>0) — se for negativo retorna 0.
 */
export function calcularBonificacaoIndividual(eficienciaIndividualPct: number): number {
  const v = calcularComponenteBonificacao(eficienciaIndividualPct);
  return v > 0 ? Math.round(v * 100) / 100 : 0;
}

/**
 * Bonificação Geral $ = componente da eficiência geral do mês (positivo ou 0).
 * Mesma fórmula, igual para todos os costureiros do período.
 */
export function calcularBonificacaoGeralValor(eficienciaGeralPct: number): number {
  const v = calcularComponenteBonificacao(eficienciaGeralPct);
  return v > 0 ? Math.round(v * 100) / 100 : 0;
}

/**
 * Bonificação Final = soma APENAS dos componentes positivos (regra SUMIF da planilha).
 * Nunca negativo.
 */
export function calcularBonificacaoFinal(
  bonificacaoGeral: number,
  bonificacaoIndividual: number
): number {
  const g = Number.isFinite(bonificacaoGeral) && bonificacaoGeral > 0 ? bonificacaoGeral : 0;
  const i = Number.isFinite(bonificacaoIndividual) && bonificacaoIndividual > 0 ? bonificacaoIndividual : 0;
  const total = g + i;
  return total > 0 ? Math.round(total * 100) / 100 : 0;
}

/* ────────────────────────────────────────────────────────────
 * Eficiência geral automática (D197/D195 a nível empresa)
 * ──────────────────────────────────────────────────────────── */

/**
 * Calcula a "Eficiência Geral do Mês" automaticamente a partir das produções:
 *   = SUM(min_efetivos) / SUM(min_disponíveis) × 100
 *
 * Equivalente a AG8 da planilha quando preenchida automaticamente.
 */
export function calcularEficienciaGeralMes(raws: StatsRaw[]): number {
  const totalEfetivo = raws.reduce((s, r) => s + r.total_minutos_produzidos, 0);
  const totalDisp = raws.reduce((s, r) => s + r.total_minutos_trabalhados, 0);
  if (totalDisp <= 0) return 0;
  return Number(((totalEfetivo / totalDisp) * 100).toFixed(2));
}

/* ────────────────────────────────────────────────────────────
 * Classificação de desempenho
 * ──────────────────────────────────────────────────────────── */

export function classificarDesempenho(
  eficienciaPct: number,
  config: MetasConfig
): 'alto' | 'medio' | 'baixo' {
  if (eficienciaPct >= config.eficiencia_meta) return 'alto';
  if (eficienciaPct >= config.eficiencia_minima) return 'medio';
  return 'baixo';
}

/* ────────────────────────────────────────────────────────────
 * Consolidação completa por costureiro
 * ──────────────────────────────────────────────────────────── */

/**
 * Consolida estatísticas mensais aplicando a fórmula da planilha.
 *
 * @param raw                 dados brutos do costureiro (D195/D197)
 * @param config              configuração da empresa
 * @param eficienciaGeralPct  eficiência geral do mês em % (ex.: 78 = 78%)
 *                            Se omitido, o componente Geral fica 0.
 */
export function consolidarEstatisticas(
  raw: StatsRaw,
  config: MetasConfig,
  eficienciaGeralPct: number = 0
): EstatisticaCostureiro {
  // Eficiência individual = D197/D195 × 100  (idêntico à planilha)
  const eficienciaRaw = raw.total_minutos_trabalhados > 0
    ? (raw.total_minutos_produzidos / raw.total_minutos_trabalhados) * 100
    : 0;
  const eficiencia = Number(eficienciaRaw.toFixed(2));

  // Frequência (informativo)
  const frequencia = config.dias_uteis_mes > 0
    ? (raw.dias_trabalhados / config.dias_uteis_mes) * 100
    : 0;

  // Qualidade (informativo)
  const qualidade = raw.total_producao > 0
    ? Math.max(0, 100 - (raw.retrabalho_total / raw.total_producao) * 100)
    : 100;

  // ─── Fórmulas da planilha — usar valor sem arredondar antes (igual Excel) ───
  const bonificacaoGeralValor = calcularBonificacaoGeralValor(eficienciaGeralPct);
  const bonificacaoIndividual = calcularBonificacaoIndividual(eficiencia);
  const bonificacaoFinal = calcularBonificacaoFinal(bonificacaoGeralValor, bonificacaoIndividual);

  const classe = classificarDesempenho(eficiencia, config);

  // Motivo informativo: se ambos componentes são 0
  let motivo: string | undefined;
  if (bonificacaoFinal === 0) {
    if (eficiencia < EFICIENCIA_MIN_BONIFICACAO && eficienciaGeralPct < EFICIENCIA_MIN_BONIFICACAO) {
      motivo = `Eficiência individual (${eficiencia.toFixed(2)}%) e geral (${eficienciaGeralPct.toFixed(2)}%) abaixo de ${EFICIENCIA_MIN_BONIFICACAO}%`;
    } else if (eficiencia < EFICIENCIA_MIN_BONIFICACAO) {
      motivo = `Eficiência individual ${eficiencia.toFixed(2)}% abaixo de ${EFICIENCIA_MIN_BONIFICACAO}%`;
    }
  }

  return {
    costureiro_id: raw.costureiro_id,
    nome: raw.nome,
    tipo_maquina: raw.tipo_maquina,
    total_producao: raw.total_producao,
    total_minutos_trabalhados: raw.total_minutos_trabalhados,
    total_minutos_produzidos: raw.total_minutos_produzidos,
    eficiencia,
    eficiencia_ponderada: eficiencia, // mantém compat — = eficiência simples
    dias_trabalhados: raw.dias_trabalhados,
    dias_uteis: config.dias_uteis_mes,
    frequencia: Number(frequencia.toFixed(2)),
    retrabalho_total: raw.retrabalho_total,
    qualidade: Number(qualidade.toFixed(2)),
    bonificacao_individual: bonificacaoIndividual,
    bonificacao_geral: bonificacaoGeralValor,
    bonificacao_final: bonificacaoFinal,
    bonus: bonificacaoFinal, // alias legado
    motivo_bloqueio: motivo,
    classe,
  };
}

/**
 * Retorna primeiro/último dia do mês.
 */
export function rangeDoMes(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0));
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}
