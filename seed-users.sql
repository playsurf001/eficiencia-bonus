-- Seed de usuários demo (empresa_id = 1)
-- Senha de todos: demo123
INSERT OR REPLACE INTO usuarios (empresa_id, email, nome, senha_hash, role, ativo) VALUES (1, 'admin@demo.com', 'Administrador Demo', 'pbkdf2$100000$G5To78pOr5kEcXlltyfnvA==$m+3+4+DRtCUBoDri1kVvDHyE+yLwpIf54LXNAyNFzJ4=', 'admin', 1);
INSERT OR REPLACE INTO usuarios (empresa_id, email, nome, senha_hash, role, ativo) VALUES (1, 'gestor@demo.com', 'Gestor Demo', 'pbkdf2$100000$GKGe2IvgR1+3i35j9SCxMA==$9HFZr4emX86faYfZMB0h7fVFoLPopz5iENuKzgWx36E=', 'gestor', 1);
INSERT OR REPLACE INTO usuarios (empresa_id, email, nome, senha_hash, role, ativo) VALUES (1, 'operador@demo.com', 'Operador Demo', 'pbkdf2$100000$/JACX0kaEJApcea+KfU9fw==$C0CcqHTKURM19R5bfL1PmgsowrOh21VJgdhP5zPpqnA=', 'operador', 1);
