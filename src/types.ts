export type Bindings = {
  DB: D1Database;
};

export interface Costureiro {
  id: number;
  empresa_id: number;
  nome: string;
  tipo_maquina: string;
  ativo: number;
  data_admissao?: string;
}

export interface Producao {
  id: number;
  empresa_id: number;
  data: string;
  costureiro_id: number;
  operacao_id?: number;
  operacao?: string;
  referencia_peca?: string;
  tempo_padrao_min: number;
  quantidade_produzida: number;
  minutos_trabalhados: number;
  retrabalho: number;
}

export interface Operacao {
  id: number;
  empresa_id: number;
  nome_operacao: string;
  grau_dificuldade: number;
  tempo_padrao_min: number;
  ativo: number;
}

export interface MetasConfig {
  id: number;
  empresa_id: number;
  eficiencia_minima: number;
  eficiencia_meta: number;
  eficiencia_excelente: number;
  bonus_faixa_1: number;
  bonus_faixa_2: number;
  bonus_faixa_3: number;
  bonus_faixa_4: number;
  frequencia_minima: number;
  retrabalho_limite: number;
  dias_uteis_mes: number;
  minutos_dia_util: number;
}

export interface EstatisticaCostureiro {
  costureiro_id: number;
  nome: string;
  tipo_maquina: string;
  total_producao: number;
  total_minutos_trabalhados: number;
  total_minutos_produzidos: number;
  eficiencia: number;
  eficiencia_ponderada: number;
  dias_trabalhados: number;
  dias_uteis: number;
  frequencia: number;
  retrabalho_total: number;
  qualidade: number;
  bonus: number;
  motivo_bloqueio?: string;
  classe: 'alto' | 'medio' | 'baixo';
}
