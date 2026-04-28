import type { MetasConfig, EstatisticaCostureiro } from './types';

/**
 * Regras de negócio — replicação EXATA da aba "Bonificação" da planilha
 *
 * Fórmula central (NÃO ALTERAR):
 *   Bonificação Individual = eficiência × 20,00 × (100 / 2)
 *   - "eficiência" é o valor decimal (ex.: 0,85 para 85%)
 *   - Só calcula se eficiência ≥ 75%, senão = 0
 *
 * Bonificação Final = Bonificação Geral (manual) + Bonificação Individual
 *   - Sempre ≥ 0
 *   - Se algum for 0, mostra apenas o outro
 */

export interface StatsRaw {
  costureiro_id: number;
  nome: string;
  tipo_maquina: string;
  total_producao: number;            // SUM(quantidade_produzida)
  total_minutos_trabalhados: number; // SUM(minutos_trabalhados)
  total_minutos_produzidos: number;  // SUM(quantidade_produzida * tempo_padrao_min)
  total_minutos_produzidos_ponderados: number; // não usado (mantido para compat de SQL)
  dias_trabalhados: number;
  retrabalho_total: number;
  total_registros: number;
}

/** Limiar mínimo de eficiência para acionar a bonificação individual */
export const EFICIENCIA_MIN_BONIFICACAO = 75; // %

/**
 * FÓRMULA EXATA da planilha — não alterar.
 *
 * @param eficienciaPct  eficiência em pontos percentuais (ex.: 85 = 85%)
 * @returns valor da bonificação individual em R$ (com 2 casas)
 */
export function calcularBonificacaoIndividual(eficienciaPct: number): number {
  if (!Number.isFinite(eficienciaPct) || eficienciaPct < EFICIENCIA_MIN_BONIFICACAO) {
    return 0;
  }
  // eficiência decimal × 20,00 × (100 / 2)
  const eficienciaDecimal = eficienciaPct / 100;
  const valor = eficienciaDecimal * 20.0 * (100 / 2);
  return Math.round(valor * 100) / 100; // 2 casas decimais
}

/**
 * Soma bonificação geral + individual, garantindo regras:
 *  - apenas valores positivos contam
 *  - resultado nunca negativo
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

/**
 * Classifica desempenho usando os limiares configuráveis (eficiência geral apenas)
 */
export function classificarDesempenho(
  eficienciaPct: number,
  config: MetasConfig
): 'alto' | 'medio' | 'baixo' {
  if (eficienciaPct >= config.eficiencia_meta) return 'alto';
  if (eficienciaPct >= config.eficiencia_minima) return 'medio';
  return 'baixo';
}

/**
 * Consolida as estatísticas mensais de um costureiro aplicando a fórmula da planilha.
 */
export function consolidarEstatisticas(
  raw: StatsRaw,
  config: MetasConfig,
  bonificacaoGeral: number = 0
): EstatisticaCostureiro {
  // Eficiência = (tempo_padrao * qtd) / minutos_trabalhados * 100
  const eficienciaRaw = raw.total_minutos_trabalhados > 0
    ? (raw.total_minutos_produzidos / raw.total_minutos_trabalhados) * 100
    : 0;
  // Mesmo arredondamento da planilha: 2 casas decimais aplicado ANTES da fórmula
  const eficiencia = Number(eficienciaRaw.toFixed(2));

  // Frequência = dias_trabalhados / dias_uteis_mes * 100
  const frequencia = config.dias_uteis_mes > 0
    ? (raw.dias_trabalhados / config.dias_uteis_mes) * 100
    : 0;

  // Qualidade: 100% - (retrabalho / producao * 100), limitado entre 0-100
  const qualidade = raw.total_producao > 0
    ? Math.max(0, 100 - (raw.retrabalho_total / raw.total_producao) * 100)
    : 100;

  // ─── BONIFICAÇÃO ─── (fórmula da planilha, sem peso/ponderação) ───
  // Usa a eficiência já arredondada (2 casas) para ser idêntico ao Excel
  const bonificacaoIndividual = calcularBonificacaoIndividual(eficiencia);
  const bonificacaoFinal = calcularBonificacaoFinal(bonificacaoGeral, bonificacaoIndividual);

  const classe = classificarDesempenho(eficiencia, config);

  return {
    costureiro_id: raw.costureiro_id,
    nome: raw.nome,
    tipo_maquina: raw.tipo_maquina,
    total_producao: raw.total_producao,
    total_minutos_trabalhados: raw.total_minutos_trabalhados,
    total_minutos_produzidos: raw.total_minutos_produzidos,
    eficiencia,
    eficiencia_ponderada: eficiencia, // mantém compat (= eficiência simples)
    dias_trabalhados: raw.dias_trabalhados,
    dias_uteis: config.dias_uteis_mes,
    frequencia: Number(frequencia.toFixed(2)),
    retrabalho_total: raw.retrabalho_total,
    qualidade: Number(qualidade.toFixed(2)),
    bonificacao_individual: bonificacaoIndividual,
    bonificacao_geral: Number(bonificacaoGeral.toFixed(2)),
    bonificacao_final: bonificacaoFinal,
    bonus: bonificacaoFinal, // compat: campo antigo
    motivo_bloqueio: eficiencia < EFICIENCIA_MIN_BONIFICACAO
      ? `Eficiência ${eficiencia.toFixed(2)}% abaixo do mínimo (${EFICIENCIA_MIN_BONIFICACAO}%) para bonificação individual`
      : undefined,
    classe,
  };
}

/**
 * Retorna o primeiro e último dia do mês
 */
export function rangeDoMes(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0));
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}
