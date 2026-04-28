-- Migration 0003: Bonificação Geral mensal (manual, por administrador)
-- Replica fielmente a aba "Bonificação" da planilha original.

CREATE TABLE IF NOT EXISTS bonificacao_geral (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  observacao TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(empresa_id, ano, mes),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE INDEX IF NOT EXISTS idx_bonificacao_geral_empresa_periodo
  ON bonificacao_geral(empresa_id, ano, mes);
