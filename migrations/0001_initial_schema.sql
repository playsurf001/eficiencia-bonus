-- =====================================================
-- Sistema de Gestão de Produção e Bonificação
-- Schema inicial - SaaS Multi-empresa
-- =====================================================

-- Tabela de empresas (multi-tenant)
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cnpj TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de costureiros
CREATE TABLE IF NOT EXISTS costureiros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER DEFAULT 1,
  nome TEXT NOT NULL,
  tipo_maquina TEXT DEFAULT 'reta',
  ativo INTEGER DEFAULT 1,
  data_admissao DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Tabela de operações e sua dificuldade
CREATE TABLE IF NOT EXISTS operacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER DEFAULT 1,
  nome_operacao TEXT NOT NULL,
  grau_dificuldade REAL DEFAULT 1.0,
  tempo_padrao_min REAL DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Tabela de produção diária
CREATE TABLE IF NOT EXISTS producao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER DEFAULT 1,
  data DATE NOT NULL,
  costureiro_id INTEGER NOT NULL,
  operacao_id INTEGER,
  operacao TEXT,
  referencia_peca TEXT,
  tempo_padrao_min REAL DEFAULT 0,
  quantidade_produzida INTEGER DEFAULT 0,
  minutos_trabalhados REAL DEFAULT 0,
  retrabalho INTEGER DEFAULT 0,
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (costureiro_id) REFERENCES costureiros(id),
  FOREIGN KEY (operacao_id) REFERENCES operacoes(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Configurações de metas e bonificação
CREATE TABLE IF NOT EXISTS metas_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER DEFAULT 1 UNIQUE,
  eficiencia_minima REAL DEFAULT 70.0,
  eficiencia_meta REAL DEFAULT 85.0,
  eficiencia_excelente REAL DEFAULT 100.0,
  bonus_faixa_1 REAL DEFAULT 100.0,
  bonus_faixa_2 REAL DEFAULT 250.0,
  bonus_faixa_3 REAL DEFAULT 400.0,
  bonus_faixa_4 REAL DEFAULT 600.0,
  frequencia_minima REAL DEFAULT 90.0,
  retrabalho_limite INTEGER DEFAULT 5,
  dias_uteis_mes INTEGER DEFAULT 22,
  minutos_dia_util REAL DEFAULT 480,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_producao_costureiro ON producao(costureiro_id);
CREATE INDEX IF NOT EXISTS idx_producao_data ON producao(data);
CREATE INDEX IF NOT EXISTS idx_producao_empresa ON producao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_producao_data_cost ON producao(data, costureiro_id);
CREATE INDEX IF NOT EXISTS idx_costureiros_empresa ON costureiros(empresa_id);
CREATE INDEX IF NOT EXISTS idx_operacoes_empresa ON operacoes(empresa_id);
