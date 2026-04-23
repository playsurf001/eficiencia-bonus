# ConfecSystem — Gestão de Produção e Bonificação Mensal

## Visão Geral do Projeto
- **Nome**: ConfecSystem
- **Objetivo**: Substituir planilhas manuais por um SaaS centralizado que controla produtividade, eficiência, qualidade e bonificação mensal dos costureiros de uma confecção.
- **Funcionalidades principais**:
  - Dashboard executivo com KPIs e evolução diária
  - Ranking automático de costureiros por eficiência
  - Perfil individual com histórico de 6 meses e produção diária
  - Controle de bonificação com simulação de cenários
  - Cadastros completos (costureiros, operações, produção)
  - Configurações de metas, faixas de bônus e regras de qualificação
  - Modo claro/escuro
  - Exportação CSV/PDF (impressão nativa)

## URLs Ativas
- **Aplicação (sandbox)**: https://3000-iq2q3bvj6paht3vi318kn-5185f4aa.sandbox.novita.ai
- **Health check**: `/api/health`
- **GitHub**: (não publicado ainda)

## Telas (Frontend SPA)
| Rota (SPA) | Descrição |
|---|---|
| `overview` | Visão geral: KPIs, evolução, top 5 e atenção necessária |
| `ranking` | Ranking completo filtrável por classe e busca por nome |
| `perfil` | Perfil individual com gráficos diário + histórico e lista de produções |
| `bonus` | Folha de bonificação + simulador de cenários + exportação CSV |
| `producao` | CRUD de registros de produção |
| `costureiros` | CRUD de costureiros |
| `operacoes` | CRUD de operações (com grau de dificuldade) |
| `config` | Ajuste de metas, faixas de bônus e regras de qualificação |

## API (REST)

### Health & Config
| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/health` | Status do servidor |
| GET | `/api/config` | Obtém metas e faixas de bônus |
| PUT | `/api/config` | Atualiza configurações globais |

### Costureiros
| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/costureiros` | Lista todos |
| POST | `/api/costureiros` | Cria novo `{nome, tipo_maquina}` |
| PUT | `/api/costureiros/:id` | Atualiza |
| DELETE | `/api/costureiros/:id` | Soft delete (preserva histórico) |

### Operações
| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/operacoes` | Lista operações ativas |
| POST | `/api/operacoes` | Cria `{nome_operacao, grau_dificuldade, tempo_padrao_min}` |
| PUT | `/api/operacoes/:id` | Atualiza |
| DELETE | `/api/operacoes/:id` | Desativa |

### Produção
| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/producao?inicio=&fim=&costureiro_id=` | Lista com filtros |
| POST | `/api/producao` | Novo registro |
| PUT | `/api/producao/:id` | Atualiza |
| DELETE | `/api/producao/:id` | Remove |

### Estatísticas (coração do sistema)
| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/stats?ano=&mes=` | KPIs + lista de costureiros consolidada |
| GET | `/api/stats/evolucao?ano=&mes=` | Série diária (produção e eficiência) |
| GET | `/api/stats/costureiro/:id?ano=&mes=` | Perfil completo com histórico 6m |
| POST | `/api/simulacao` | Simula bônus com configurações diferentes |

## Arquitetura de Dados

### Modelos (tabelas D1)
- **empresas** — multi-tenant (id, nome, cnpj, ativo)
- **costureiros** — id, empresa_id, nome, tipo_maquina (reta/overlock/galoneira/caseadeira/travete), ativo
- **operacoes** — id, nome_operacao, grau_dificuldade, tempo_padrao_min, ativo
- **producao** — data, costureiro_id, operacao_id, referencia_peca, tempo_padrao_min, quantidade_produzida, minutos_trabalhados, retrabalho
- **metas_config** — eficiência (mín/meta/excelente), 4 faixas de bônus, frequência mín, retrabalho limite, dias úteis

### Serviços de Armazenamento
- **Cloudflare D1** (SQLite distribuído): banco principal do sistema
- Arquitetura pronta para **KV** (cache) e **R2** (exportações) no futuro

### Fluxo de Dados
```
Produção diária → D1 (INSERT) → /api/stats (agregação SQL) → Consolidador (business.ts) → Frontend (Chart.js + Tailwind)
```

## Regras de Negócio Implementadas

### Fórmulas
```
Eficiência = (Σ quantidade × tempo_padrão) / Σ minutos_trabalhados × 100
Ef. Ponderada = (Σ quantidade × tempo_padrão × dificuldade) / Σ minutos_trabalhados × 100
Frequência = dias_trabalhados / dias_úteis_mês × 100
Qualidade = 100 - (retrabalho_total / produção_total × 100)
```

### Tabela de Bônus (configurável)
| Eficiência | Bônus Padrão |
|---|---|
| < 70% | R$ 0 |
| 70% – 85% | R$ 100 |
| 85% – 100% | R$ 250 |
| 100% – 115% | R$ 400 |
| > 115% | R$ 600 |

### Bloqueios (obrigatórios)
- Frequência < 90% → bônus zerado
- Retrabalho acima do limite → bônus zerado
- O motivo do bloqueio é exibido em todas as telas

## Dados Iniciais (Seed)
- **42 costureiros** importados da planilha `BONIFICAÇAO MENSAL.xlsx` (todos os nomes reais: ADEMILSON, ADENALDO, EDSON, MONIQUE, ROSENILDO, etc.)
- **15 operações típicas** de confecção com tempos e dificuldades
- **1.315 registros de produção** gerados para outubro/2026, respeitando as eficiências reais da planilha por costureiro

## Guia Rápido de Uso
1. Acesse a URL da aplicação
2. Abra **Visão Geral** — veja os KPIs do mês corrente
3. Use os seletores de **Mês/Ano** no topo para navegar no tempo
4. Vá em **Ranking** para ordenar por eficiência e clicar em cada costureiro
5. Em **Perfil Individual**, veja desempenho diário e histórico de 6 meses
6. **Bonificação** mostra folha final; use o simulador para testar outras faixas
7. **Configurações** permite ajustar metas, bônus e regras
8. Botão **PDF** (no topo) imprime/exporta qualquer tela
9. Alterne entre modo claro/escuro pelo botão da sidebar

## Status do Deploy
- **Plataforma**: Cloudflare Pages + D1 (local, pronto para produção)
- **Status**: ✅ Ativo localmente (PM2)
- **Tech Stack**:
  - Backend: **Hono** (Cloudflare Workers)
  - Banco: **Cloudflare D1** (SQLite distribuído)
  - Build: **Vite** + `@hono/vite-build/cloudflare-pages`
  - Frontend: **Vanilla JS SPA** + Tailwind (CDN) + Chart.js + FontAwesome
  - Processo: **PM2** com wrangler pages dev
- **Última atualização**: 2026-04-23

## Estrutura de Arquivos
```
webapp/
├── migrations/0001_initial_schema.sql   # Schema D1
├── seed.sql                              # 42 costureiros + 1315 produções
├── src/
│   ├── index.tsx                         # Hono + rotas API
│   ├── business.ts                       # Regras de negócio (cálculos)
│   ├── types.ts                          # Tipos TypeScript
│   └── renderer.tsx                      # HTML shell + tema
├── public/static/
│   ├── app.js                            # SPA completa (~1600 linhas)
│   └── style.css                         # Estilos customizados
├── ecosystem.config.cjs                  # PM2 com wrangler D1
├── wrangler.jsonc                        # Config Cloudflare Pages
└── vite.config.ts                        # Build Hono
```

## Funcionalidades Ainda Não Implementadas (Roadmap)
1. **Autenticação multiusuário** (JWT) — estrutura multi-empresa já existe no banco
2. **Upload de planilha Excel** para importação em massa
3. **Notificações automáticas** (WhatsApp/email) para metas atingidas
4. **Relatórios PDF customizados** com template branded
5. **API pública** com tokens para integração ERP
6. **Previsão de produção** com regressão linear/sazonalidade
7. **Gamificação** — badges, desafios semanais
8. **App mobile PWA** para supervisores apontarem produção no chão-de-fábrica
9. **Detalhamento por referência de peça** (qual modelo rende mais)
10. **Análise de causa-raiz** do retrabalho por costureiro/operação

## Próximos Passos Recomendados
1. **Subir ao Cloudflare Pages** (setup_cloudflare_api_key + deploy produção)
2. **Criar D1 remoto** (`wrangler d1 create webapp-production`) e aplicar migrations
3. **Adicionar importador XLSX** (endpoint `POST /api/import/xlsx`) para retroalimentar de planilhas existentes
4. **Login com Cloudflare Access** para ativar multi-empresa real
5. **Cronjob mensal** via Worker Scheduler para fechamento automático
