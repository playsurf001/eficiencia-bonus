import type { MetasConfig, EstatisticaCostureiro } from './types';

/**
 * Regras de negócio: cálculo de eficiência, frequência, qualidade e bonificação
 */

export interface StatsRaw {
  costureiro_id: number;
  nome: string;
  tipo_maquina: string;
  total_producao: number;          // SUM(quantidade_produzida)
  total_minutos_trabalhados: number; // SUM(minutos_trabalhados)
  total_minutos_produzidos: number; // SUM(quantidade_produzida * tempo_padrao_min)
  total_minutos_produzidos_ponderados: number; // SUM(qtd * tempo_padrao * dificuldade)
  dias_trabalhados: number;
  retrabalho_total: number;
  total_registros: number;
}

/**
 * Calcula o bônus baseado na eficiência (%) conforme a tabela de faixas
 */
export function calcularBonus(
  eficienciaPct: number,
  config: MetasConfig
): number {
  if (eficienciaPct < 70) return 0;
  if (eficienciaPct < 85) return config.bonus_faixa_1;
  if (eficienciaPct < 100) return config.bonus_faixa_2;
  if (eficienciaPct < 115) return config.bonus_faixa_3;
  return config.bonus_faixa_4;
}

/**
 * Classifica o desempenho em alto / médio / baixo
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
 * Consolida estatísticas de um costureiro aplicando regras de negócio
 */
export function consolidarEstatisticas(
  raw: StatsRaw,
  config: MetasConfig
): EstatisticaCostureiro {
  // Eficiência = (tempo_padrao * qtd) / minutos_trabalhados * 100
  const eficiencia = raw.total_minutos_trabalhados > 0
    ? (raw.total_minutos_produzidos / raw.total_minutos_trabalhados) * 100
    : 0;

  // Eficiência ponderada = média ponderada pela dificuldade
  const eficienciaPonderada = raw.total_minutos_trabalhados > 0
    ? (raw.total_minutos_produzidos_ponderados / raw.total_minutos_trabalhados) * 100
    : 0;

  // Frequência = dias_trabalhados / dias_uteis_mes * 100
  const frequencia = config.dias_uteis_mes > 0
    ? (raw.dias_trabalhados / config.dias_uteis_mes) * 100
    : 0;

  // Qualidade: 100% - (retrabalho / producao * 100), limitado entre 0-100
  const qualidade = raw.total_producao > 0
    ? Math.max(0, 100 - (raw.retrabalho_total / raw.total_producao) * 100)
    : 100;

  // Cálculo do bônus
  let bonus = calcularBonus(eficiencia, config);
  let motivo_bloqueio: string | undefined;

  if (frequencia < config.frequencia_minima) {
    bonus = 0;
    motivo_bloqueio = `Frequência ${frequencia.toFixed(1)}% abaixo do mínimo (${config.frequencia_minima}%)`;
  } else if (raw.retrabalho_total > config.retrabalho_limite) {
    bonus = 0;
    motivo_bloqueio = `Retrabalho de ${raw.retrabalho_total} peças acima do limite (${config.retrabalho_limite})`;
  }

  const classe = classificarDesempenho(eficiencia, config);

  return {
    costureiro_id: raw.costureiro_id,
    nome: raw.nome,
    tipo_maquina: raw.tipo_maquina,
    total_producao: raw.total_producao,
    total_minutos_trabalhados: raw.total_minutos_trabalhados,
    total_minutos_produzidos: raw.total_minutos_produzidos,
    eficiencia: Number(eficiencia.toFixed(2)),
    eficiencia_ponderada: Number(eficienciaPonderada.toFixed(2)),
    dias_trabalhados: raw.dias_trabalhados,
    dias_uteis: config.dias_uteis_mes,
    frequencia: Number(frequencia.toFixed(2)),
    retrabalho_total: raw.retrabalho_total,
    qualidade: Number(qualidade.toFixed(2)),
    bonus,
    motivo_bloqueio,
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
