-- =====================================================
-- Migration 0002 — Autenticação e Multi-tenant
-- =====================================================

-- Tabela de usuários (multi-empresa)
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL DEFAULT 1,
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operador', -- admin, gestor, operador, viewer
  ativo INTEGER DEFAULT 1,
  ultimo_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id);

-- Adicionar slug e plano à empresa
ALTER TABLE empresas ADD COLUMN slug TEXT;
ALTER TABLE empresas ADD COLUMN plano TEXT DEFAULT 'free';
ALTER TABLE empresas ADD COLUMN logo_url TEXT;

-- Atualizar empresa padrão com slug
UPDATE empresas SET slug = 'padrao' WHERE id = 1 AND slug IS NULL;

-- Tabela de sessões (para invalidação de tokens)
CREATE TABLE IF NOT EXISTS sessoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  jti TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_sessoes_jti ON sessoes(jti);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

-- Log de auditoria (opcional, útil para enterprise)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  usuario_id INTEGER,
  acao TEXT NOT NULL,
  entidade TEXT,
  entidade_id INTEGER,
  detalhes TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_empresa ON audit_log(empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_data ON audit_log(created_at);
