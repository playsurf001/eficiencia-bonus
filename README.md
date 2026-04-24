# CorePro Eficiência — Gestão de Produção e Bonificação Mensal

> *Onde sistemas se tornam negócio*

## Visão Geral do Projeto
- **Nome**: CorePro Eficiência
- **Objetivo**: Substituir planilhas manuais por um SaaS centralizado (multi-tenant) que controla produtividade, eficiência, qualidade e bonificação mensal dos costureiros de uma confecção.
- **Funcionalidades principais**:
  - Autenticação JWT multi-usuário com RBAC (admin/gestor/operador/viewer)
  - Arquitetura SaaS multi-tenant (cada confecção com dados isolados)
  - Dashboard executivo com KPIs e evolução diária
  - Ranking automático de costureiros por eficiência
  - Perfil individual com histórico de 6 meses e produção diária
  - Controle de bonificação com simulação de cenários
  - Cadastros completos (costureiros, operações, produção)
  - Configurações de metas, faixas de bônus e regras de qualificação
  - **Importador de Excel** (arrasta a planilha `BONIFICAÇAO MENSAL.xlsx` e migra dados antigos)
  - Modo claro/escuro, gráficos interativos (Chart.js)
  - Exportação CSV/PDF (impressão nativa do navegador)

## 🌐 URLs em Produção
- **🎯 Domínio fixo**: https://corepro-eficiencia.pages.dev
- **Health check**: https://corepro-eficiencia.pages.dev/api/health
- **Sandbox dev**: https://3000-iq2q3bvj6paht3vi318kn-5185f4aa.sandbox.novita.ai
- **GitHub**: https://github.com/playsurf001/eficiencia-bonus

## 🎨 Identidade Visual
- **Logo principal**: `/static/brand/icon-192.png` (ícone hexagonal com circuitos)
- **Logo horizontal**: `/static/brand/corepro-horizontal.png`
- **Favicon**: `/static/brand/favicon.ico` (16/32/48px)
- **Apple touch**: `/static/brand/apple-touch-icon.png` (180px)
- **PWA manifest**: `/static/manifest.webmanifest`
- **OG image**: `/static/brand/og-image.png` (1200x630)
- **Paleta**: teal `#0f768f`/`#2ea2cc` + accent laranja `#e53e24`

## 🔐 Usuários Demo (senha: `demo123`)
| E-mail                | Papel     | Permissões                                    |
| --------------------- | --------- | --------------------------------------------- |
| `admin@demo.com`      | admin     | Tudo (usuários, configurações, importação)    |
| `gestor@demo.com`     | gestor    | Configurações, importação, cadastros, dados   |
| `operador@demo.com`   | operador  | Lançamentos de produção                       |

> ⚠️ **Importante**: troque as senhas em produção e gere um novo `JWT_SECRET` via `wrangler pages secret put JWT_SECRET --project-name confecsystem-eficiencia`.

## 🧭 Principais endpoints da API

### Autenticação (público / autenticado)
| Método | Rota                 | Descrição                                              |
| ------ | -------------------- | ------------------------------------------------------ |
| POST   | `/api/auth/login`    | `{email, senha}` → `{token, user}` (seta cookie também) |
| POST   | `/api/auth/logout`   | Revoga sessão atual                                    |
| GET    | `/api/auth/me`       | Retorna usuário autenticado (cookie ou Bearer)         |
| POST   | `/api/auth/register` | **admin** cria usuário (outro admin/gestor/operador)   |
| GET    | `/api/usuarios`      | **admin** lista usuários da empresa                    |

### Importador Excel
| Método | Rota                               | Descrição                                                                      |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------ |
| POST   | `/api/import/xlsx?dryRun=true`     | **admin/gestor** Sobe `multipart file=@...xlsx` e retorna análise sem gravar   |
| POST   | `/api/import/xlsx`                 | **admin/gestor** Grava costureiros, operações e produção no banco              |

O importador reconhece automaticamente o formato da planilha `BONIFICAÇAO MENSAL.xlsx` (cabeçalho em `C3`, aba por costureiro ou aba única), cria costureiros/operações novos, e opcionalmente substitui dados do mês.

### Dados / Relatórios (público somente leitura hoje; pode virar autenticado)
| Método | Rota                           | Descrição                                                      |
| ------ | ------------------------------ | -------------------------------------------------------------- |
| GET    | `/api/stats?ano=2026&mes=10`   | KPIs agregados do período                                      |
| GET    | `/api/stats/costureiro/:id`    | Estatísticas individuais (diário + histórico 6 meses)          |
| GET    | `/api/costureiros`             | Lista costureiros                                              |
| POST   | `/api/costureiros`             | **admin/gestor** cria costureiro                               |
| PUT    | `/api/costureiros/:id`         | **admin/gestor** atualiza                                      |
| DELETE | `/api/costureiros/:id`         | **admin** exclui                                               |
| GET    | `/api/operacoes`               | Catálogo de operações                                          |
| POST   | `/api/operacoes`               | **admin/gestor**                                               |
| GET    | `/api/producao`                | Lista produção (filtros: inicio, fim, costureiro_id)           |
| POST   | `/api/producao`                | **admin/gestor/operador** lança produção                       |
| POST   | `/api/simulacao`               | Simulação "what-if" de cenários de bonificação                 |
| GET    | `/api/config`                  | Configuração atual (metas, bônus, limites)                     |
| PUT    | `/api/config`                  | **admin/gestor** atualiza configuração                         |

Ex.:
```bash
# Login
TOKEN=$(curl -s -X POST https://corepro-eficiencia.pages.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","senha":"demo123"}' | jq -r .token)

# Importar Excel
curl -X POST "https://corepro-eficiencia.pages.dev/api/import/xlsx?dryRun=true" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@BONIFICAÇAO MENSAL.xlsx"
```

## 🗄️ Arquitetura de Dados (Cloudflare D1 / SQLite)
- **empresas** (multi-tenant): `id, nome, plano, ativo`
- **usuarios**: `id, empresa_id, email, senha_hash (PBKDF2), nome, role, ativo, ultimo_login`
- **sessoes**: `id, usuario_id, jti, expires_at, revoked` (lista de revogação para JWT)
- **costureiros**: `id, empresa_id, nome, tipo_maquina, ativo, data_admissao`
- **operacoes**: `id, empresa_id, nome_operacao, grau_dificuldade`
- **producao**: `id, empresa_id, data, costureiro_id, operacao_id, referencia_peca, tempo_padrao_min, quantidade_produzida, minutos_trabalhados, retrabalho`
- **metas_config**: `empresa_id, eficiencia_minima/meta/excelente, bonus_faixa_1..4, frequencia_minima, retrabalho_limite, dias_uteis_mes, minutos_dia_util`
- **auditoria**: `usuario_id, empresa_id, acao, entidade, detalhes, ip, user_agent, created_at`

Dados em produção: **42 costureiros**, **1.315 lançamentos** (outubro/2026), **15 operações**, **3 usuários demo**, **1 empresa seed**.

## 🧮 Regras de Negócio
- **Eficiência**: `(tempo_padrao × quantidade) / minutos_trabalhados × 100`
- **Eficiência ponderada**: `eficiência × grau_dificuldade`
- **Frequência**: `dias_trabalhados / dias_úteis` — precisa `> 90%`
- **Qualidade**: total de `retrabalho` no mês deve ser `≤ retrabalho_limite`
- **Tabela de bonificação** (só paga se frequência ≥ 90% e retrabalho OK):
  - `< 70%` → R$ 0
  - `70%–85%` → R$ 100
  - `85%–100%` → R$ 250
  - `100%–115%` → R$ 400
  - `> 115%` → R$ 600

## 🚀 Deploy

### Produção (Cloudflare Pages + D1)
```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name confecsystem-eficiencia --branch main

# Secrets
npx wrangler pages secret put JWT_SECRET --project-name confecsystem-eficiencia

# Migrações
npx wrangler d1 execute corepro-eficiencia --remote --file=./migrations/0001_initial_schema.sql
npx wrangler d1 execute corepro-eficiencia --remote --file=./migrations/0002_auth_multi_tenant.sql
npx wrangler d1 execute corepro-eficiencia --remote --file=./seed.sql
npx wrangler d1 execute corepro-eficiencia --remote --file=./seed-users.sql
```

### Desenvolvimento local (sandbox)
```bash
cd /home/user/webapp
npm run build
pm2 start ecosystem.config.cjs
# URL: http://localhost:3000
```

## 🎯 Stack técnica
- **Backend**: Hono 4.12 (TypeScript) sobre Cloudflare Workers, JWT (`hono/jwt` HS256), Web Crypto (PBKDF2) para senhas
- **Banco**: Cloudflare D1 (SQLite distribuído)
- **Frontend**: SPA Vanilla JS + TailwindCSS (CDN) + Chart.js + FontAwesome
- **Build**: Vite + `@hono/vite-build` + Wrangler 4.82
- **Dev**: PM2 (processo daemon) + Wrangler Pages Dev

## 📌 Status
- **Plataforma**: Cloudflare Pages
- **Status**: ✅ Ativo em produção (https://corepro-eficiencia.pages.dev)
- **Última atualização**: 23/04/2026
- **Deploy ID**: 47d17129

## 🛠️ Próximos passos sugeridos
1. Tornar `/api/stats`, `/api/costureiros` etc. também protegidos (hoje são leitura pública p/ facilitar demo) ativando `authMiddleware` em todas as rotas
2. Adicionar tela de administração de usuários no frontend (já existe o backend)
3. Habilitar Cloudflare Turnstile no login (anti-bot)
4. Publicar Tailwind via build em vez do CDN para eliminar o warning
5. Enviar notificações mensais (email/Slack) com o relatório de bonificação
6. Criar página pública de convite de novos usuários com token
