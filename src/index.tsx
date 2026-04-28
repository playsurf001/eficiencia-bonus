import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { setCookie, deleteCookie } from 'hono/cookie'
import { renderer } from './renderer'
import type { Bindings, MetasConfig } from './types'
import { consolidarEstatisticas, calcularComponenteBonificacao, rangeDoMes, type StatsRaw } from './business'
import {
  createToken, verifyToken, hashPassword, verifyPassword,
  getJwtSecret, getTokenFromRequest, type JwtPayload,
} from './auth'
import { importXLSX } from './xlsx-import'

type Variables = { user: JwtPayload }
const app = new Hono<{ Bindings: Bindings & { JWT_SECRET?: string }; Variables: Variables }>()

app.use('/api/*', cors({ origin: '*', credentials: true }))
app.use(renderer)

/* =============================================================
 *  MIDDLEWARE DE AUTENTICAÇÃO
 * ============================================================= */
async function authMiddleware(c: any, next: any) {
  const token = getTokenFromRequest(c)
  if (!token) return c.json({ error: 'Não autenticado' }, 401)
  const secret = getJwtSecret(c.env)
  const payload = await verifyToken(token, secret)
  if (!payload) return c.json({ error: 'Token inválido ou expirado' }, 401)
  // Verifica se a sessão não foi revogada
  const row = await c.env.DB.prepare('SELECT revoked FROM sessoes WHERE jti = ?').bind(payload.jti).first<any>()
  if (row && row.revoked) return c.json({ error: 'Sessão revogada' }, 401)
  c.set('user', payload)
  await next()
}

function requireRole(...roles: string[]) {
  return async (c: any, next: any) => {
    const u: JwtPayload = c.get('user')
    if (!u || !roles.includes(u.role)) return c.json({ error: 'Sem permissão' }, 403)
    await next()
  }
}

// Helper para pegar empresa_id do usuário autenticado ou fallback (público demo)
async function getEmpresaId(c: any): Promise<number> {
  const u: JwtPayload | undefined = c.get('user')
  if (u) return u.empresa_id
  return 1 // demo público
}

/* =============================================================
 *  HELPERS
 * ============================================================= */
async function getConfig(DB: D1Database, empresa_id = 1): Promise<MetasConfig> {
  const cfg = await DB.prepare('SELECT * FROM metas_config WHERE empresa_id = ?')
    .bind(empresa_id)
    .first<MetasConfig>()
  if (cfg) return cfg
  return {
    id: 0, empresa_id,
    eficiencia_minima: 70, eficiencia_meta: 85, eficiencia_excelente: 100,
    bonus_faixa_1: 100, bonus_faixa_2: 250, bonus_faixa_3: 400, bonus_faixa_4: 600,
    frequencia_minima: 90, retrabalho_limite: 5, dias_uteis_mes: 22, minutos_dia_util: 480,
  }
}

/* =============================================================
 *  API — AUTH
 * ============================================================= */
app.post('/api/auth/login', async (c) => {
  const body = await c.req.json<{ email: string; senha: string }>()
  if (!body.email || !body.senha) return c.json({ error: 'E-mail e senha obrigatórios' }, 400)
  const user = await c.env.DB.prepare(
    'SELECT u.*, e.nome as empresa_nome FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.email = ? AND u.ativo = 1'
  ).bind(body.email.toLowerCase().trim()).first<any>()
  if (!user) return c.json({ error: 'Credenciais inválidas' }, 401)
  const ok = await verifyPassword(body.senha, user.senha_hash)
  if (!ok) return c.json({ error: 'Credenciais inválidas' }, 401)

  const secret = getJwtSecret(c.env)
  const { token, jti, exp } = await createToken(
    { sub: user.id, email: user.email, nome: user.nome, empresa_id: user.empresa_id, role: user.role },
    secret
  )
  // Registrar sessão
  await c.env.DB.prepare(
    'INSERT INTO sessoes (usuario_id, jti, expires_at) VALUES (?, ?, ?)'
  ).bind(user.id, jti, new Date(exp * 1000).toISOString()).run()
  await c.env.DB.prepare('UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id).run()

  // Cookie + body
  setCookie(c, 'cs_token', token, {
    httpOnly: true, secure: true, sameSite: 'Lax',
    path: '/', maxAge: 60 * 60 * 24 * 7,
  })
  return c.json({
    token,
    user: {
      id: user.id, email: user.email, nome: user.nome, role: user.role,
      empresa_id: user.empresa_id, empresa_nome: user.empresa_nome,
    },
  })
})

app.post('/api/auth/register', async (c) => {
  const body = await c.req.json<{ email: string; senha: string; nome: string; empresa_nome?: string }>()
  if (!body.email || !body.senha || !body.nome)
    return c.json({ error: 'Campos obrigatórios: email, senha, nome' }, 400)
  if (body.senha.length < 6) return c.json({ error: 'Senha deve ter pelo menos 6 caracteres' }, 400)

  const email = body.email.toLowerCase().trim()
  const existente = await c.env.DB.prepare('SELECT id FROM usuarios WHERE email = ?').bind(email).first()
  if (existente) return c.json({ error: 'E-mail já cadastrado' }, 400)

  // Criar nova empresa OU entrar na empresa padrão como admin
  let empresa_id = 1
  let role = 'admin'
  if (body.empresa_nome && body.empresa_nome.trim()) {
    const slug = body.empresa_nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + Date.now().toString(36)
    const r = await c.env.DB.prepare(
      'INSERT INTO empresas (nome, slug, plano, ativo) VALUES (?, ?, ?, 1)'
    ).bind(body.empresa_nome.trim(), slug, 'free').run()
    empresa_id = Number(r.meta.last_row_id)
    // Criar metas_config padrão
    await c.env.DB.prepare(
      `INSERT INTO metas_config (empresa_id, eficiencia_minima, eficiencia_meta, eficiencia_excelente,
        bonus_faixa_1, bonus_faixa_2, bonus_faixa_3, bonus_faixa_4, frequencia_minima, retrabalho_limite, dias_uteis_mes)
        VALUES (?, 70, 85, 100, 100, 250, 400, 600, 90, 5, 22)`
    ).bind(empresa_id).run()
  }

  const senha_hash = await hashPassword(body.senha)
  const r = await c.env.DB.prepare(
    'INSERT INTO usuarios (empresa_id, email, nome, senha_hash, role, ativo) VALUES (?, ?, ?, ?, ?, 1)'
  ).bind(empresa_id, email, body.nome.trim(), senha_hash, role).run()

  // Já faz login
  const secret = getJwtSecret(c.env)
  const { token, jti, exp } = await createToken(
    { sub: Number(r.meta.last_row_id), email, nome: body.nome.trim(), empresa_id, role: role as any },
    secret
  )
  await c.env.DB.prepare('INSERT INTO sessoes (usuario_id, jti, expires_at) VALUES (?, ?, ?)')
    .bind(r.meta.last_row_id, jti, new Date(exp * 1000).toISOString()).run()

  setCookie(c, 'cs_token', token, {
    httpOnly: true, secure: true, sameSite: 'Lax',
    path: '/', maxAge: 60 * 60 * 24 * 7,
  })
  return c.json({
    token,
    user: { id: r.meta.last_row_id, email, nome: body.nome, role, empresa_id },
  })
})

app.post('/api/auth/logout', async (c) => {
  const token = getTokenFromRequest(c)
  if (token) {
    const secret = getJwtSecret(c.env)
    const p = await verifyToken(token, secret)
    if (p) {
      await c.env.DB.prepare('UPDATE sessoes SET revoked = 1 WHERE jti = ?').bind(p.jti).run()
    }
  }
  deleteCookie(c, 'cs_token', { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const token = getTokenFromRequest(c)
  if (!token) return c.json({ authenticated: false, reason: 'no_token' })
  const secret = getJwtSecret(c.env)
  try {
    const p = await verifyToken(token, secret)
    if (!p) return c.json({ authenticated: false, reason: 'invalid_token' })
    const user = await c.env.DB.prepare(
      'SELECT u.id, u.email, u.nome, u.role, u.empresa_id, e.nome as empresa_nome FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.id = ?'
    ).bind(p.sub).first<any>()
    if (!user) return c.json({ authenticated: false, reason: 'user_not_found' })
    return c.json({ authenticated: true, user })
  } catch (e: any) {
    return c.json({ authenticated: false, reason: 'exception', msg: e.message })
  }
})

/* =============================================================
 *  API — HEALTH / CONFIG
 * ============================================================= */
app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now(), version: '1.1.0' }))

app.get('/api/config', async (c) => {
  const eid = await getEmpresaId(c)
  const cfg = await getConfig(c.env.DB, eid)
  return c.json(cfg)
})

app.put('/api/config', authMiddleware, requireRole('admin', 'gestor'), async (c) => {
  const u = c.get('user')
  const body = await c.req.json<Partial<MetasConfig>>()
  const cfg = await getConfig(c.env.DB, u.empresa_id)
  const merged = { ...cfg, ...body }
  await c.env.DB.prepare(
    `UPDATE metas_config SET
      eficiencia_minima=?, eficiencia_meta=?, eficiencia_excelente=?,
      bonus_faixa_1=?, bonus_faixa_2=?, bonus_faixa_3=?, bonus_faixa_4=?,
      frequencia_minima=?, retrabalho_limite=?, dias_uteis_mes=?, updated_at=CURRENT_TIMESTAMP
      WHERE empresa_id=?`
  )
    .bind(
      merged.eficiencia_minima, merged.eficiencia_meta, merged.eficiencia_excelente,
      merged.bonus_faixa_1, merged.bonus_faixa_2, merged.bonus_faixa_3, merged.bonus_faixa_4,
      merged.frequencia_minima, merged.retrabalho_limite, merged.dias_uteis_mes,
      u.empresa_id
    )
    .run()
  return c.json({ ok: true, config: merged })
})

/* =============================================================
 *  API — COSTUREIROS
 * ============================================================= */
app.get('/api/costureiros', async (c) => {
  const eid = await getEmpresaId(c)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM costureiros WHERE empresa_id = ? ORDER BY nome'
  ).bind(eid).all()
  return c.json(results)
})

app.post('/api/costureiros', authMiddleware, requireRole('admin', 'gestor', 'operador'), async (c) => {
  const u = c.get('user')
  const body = await c.req.json<any>()
  if (!body.nome || body.nome.trim() === '')
    return c.json({ error: 'Nome é obrigatório' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO costureiros (empresa_id, nome, tipo_maquina, data_admissao) VALUES (?, ?, ?, ?)'
  )
    .bind(u.empresa_id, body.nome.trim().toUpperCase(), body.tipo_maquina || 'reta', body.data_admissao || null)
    .run()
  return c.json({ id: r.meta.last_row_id, ...body })
})

app.put('/api/costureiros/:id', authMiddleware, requireRole('admin', 'gestor', 'operador'), async (c) => {
  const u = c.get('user')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<any>()
  await c.env.DB.prepare(
    'UPDATE costureiros SET nome=?, tipo_maquina=?, ativo=? WHERE id=? AND empresa_id=?'
  )
    .bind(
      (body.nome || '').trim().toUpperCase(),
      body.tipo_maquina || 'reta',
      body.ativo ?? 1,
      id, u.empresa_id
    )
    .run()
  return c.json({ ok: true })
})

app.delete('/api/costureiros/:id', authMiddleware, requireRole('admin', 'gestor'), async (c) => {
  const u = c.get('user')
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('UPDATE costureiros SET ativo=0 WHERE id=? AND empresa_id=?')
    .bind(id, u.empresa_id).run()
  return c.json({ ok: true })
})

/* =============================================================
 *  API — OPERAÇÕES
 * ============================================================= */
app.get('/api/operacoes', async (c) => {
  const eid = await getEmpresaId(c)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM operacoes WHERE empresa_id = ? AND ativo = 1 ORDER BY nome_operacao'
  ).bind(eid).all()
  return c.json(results)
})

app.post('/api/operacoes', authMiddleware, requireRole('admin', 'gestor'), async (c) => {
  const u = c.get('user')
  const body = await c.req.json<any>()
  const r = await c.env.DB.prepare(
    'INSERT INTO operacoes (empresa_id, nome_operacao, grau_dificuldade, tempo_padrao_min) VALUES (?, ?, ?, ?)'
  )
    .bind(u.empresa_id, body.nome_operacao, body.grau_dificuldade || 1.0, body.tempo_padrao_min || 0)
    .run()
  return c.json({ id: r.meta.last_row_id })
})

app.put('/api/operacoes/:id', authMiddleware, requireRole('admin', 'gestor'), async (c) => {
  const u = c.get('user')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<any>()
  await c.env.DB.prepare(
    'UPDATE operacoes SET nome_operacao=?, grau_dificuldade=?, tempo_padrao_min=? WHERE id=? AND empresa_id=?'
  )
    .bind(body.nome_operacao, body.grau_dificuldade || 1.0, body.tempo_padrao_min || 0, id, u.empresa_id)
    .run()
  return c.json({ ok: true })
})

app.delete('/api/operacoes/:id', authMiddleware, requireRole('admin', 'gestor'), async (c) => {
  const u = c.get('user')
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('UPDATE operacoes SET ativo=0 WHERE id=? AND empresa_id=?')
    .bind(id, u.empresa_id).run()
  return c.json({ ok: true })
})

/* =============================================================
 *  API — PRODUÇÃO
 * ============================================================= */
app.get('/api/producao', async (c) => {
  const eid = await getEmpresaId(c)
  const inicio = c.req.query('inicio')
  const fim = c.req.query('fim')
  const costureiro_id = c.req.query('costureiro_id')
  let sql = `
    SELECT p.*, c.nome AS costureiro_nome, c.tipo_maquina
    FROM producao p
    JOIN costureiros c ON c.id = p.costureiro_id
    WHERE p.empresa_id = ?
  `
  const params: any[] = [eid]
  if (inicio) { sql += ' AND p.data >= ?'; params.push(inicio) }
  if (fim) { sql += ' AND p.data <= ?'; params.push(fim) }
  if (costureiro_id) { sql += ' AND p.costureiro_id = ?'; params.push(Number(costureiro_id)) }
  sql += ' ORDER BY p.data DESC, p.id DESC LIMIT 2000'
  const { results } = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json(results)
})

app.post('/api/producao', authMiddleware, requireRole('admin', 'gestor', 'operador'), async (c) => {
  const u = c.get('user')
  const body = await c.req.json<any>()
  if (!body.costureiro_id || !body.data)
    return c.json({ error: 'costureiro_id e data são obrigatórios' }, 400)
  const r = await c.env.DB.prepare(
    `INSERT INTO producao
      (empresa_id, data, costureiro_id, operacao_id, operacao, referencia_peca,
       tempo_padrao_min, quantidade_produzida, minutos_trabalhados, retrabalho)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      u.empresa_id, body.data, Number(body.costureiro_id),
      body.operacao_id || null, body.operacao || null, body.referencia_peca || null,
      Number(body.tempo_padrao_min) || 0,
      Number(body.quantidade_produzida) || 0,
      Number(body.minutos_trabalhados) || 0,
      Number(body.retrabalho) || 0,
    )
    .run()
  return c.json({ id: r.meta.last_row_id })
})

app.put('/api/producao/:id', authMiddleware, requireRole('admin', 'gestor', 'operador'), async (c) => {
  const u = c.get('user')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<any>()
  await c.env.DB.prepare(
    `UPDATE producao SET
      data=?, costureiro_id=?, operacao_id=?, operacao=?, referencia_peca=?,
      tempo_padrao_min=?, quantidade_produzida=?, minutos_trabalhados=?, retrabalho=?
      WHERE id=? AND empresa_id=?`
  )
    .bind(
      body.data, Number(body.costureiro_id), body.operacao_id || null,
      body.operacao || null, body.referencia_peca || null,
      Number(body.tempo_padrao_min) || 0,
      Number(body.quantidade_produzida) || 0,
      Number(body.minutos_trabalhados) || 0,
      Number(body.retrabalho) || 0,
      id, u.empresa_id
    )
    .run()
  return c.json({ ok: true })
})

app.delete('/api/producao/:id', authMiddleware, requireRole('admin', 'gestor'), async (c) => {
  const u = c.get('user')
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM producao WHERE id=? AND empresa_id=?')
    .bind(id, u.empresa_id).run()
  return c.json({ ok: true })
})

/* =============================================================
 *  API — IMPORTADOR XLSX
 * ============================================================= */
app.post('/api/import/xlsx', authMiddleware, requireRole('admin', 'gestor'), async (c) => {
  const u = c.get('user')
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: 'Arquivo não enviado (campo "file")' }, 400)

    const ano = Number(formData.get('ano')) || new Date().getUTCFullYear()
    const mes = Number(formData.get('mes')) || (new Date().getUTCMonth() + 1)
    const substituir = formData.get('substituir_mes') === 'true'

    const buffer = await file.arrayBuffer()
    const stats = await importXLSX(buffer, c.env.DB, {
      empresa_id: u.empresa_id,
      ano, mes,
      substituir_mes: substituir,
    })
    return c.json({ ok: true, stats })
  } catch (e: any) {
    console.error('Erro no import:', e)
    return c.json({ error: `Falha na importação: ${e.message}` }, 500)
  }
})

/* =============================================================
 *  API — ESTATÍSTICAS (KPIs / RANKING / PERFIL)
 * ============================================================= */
async function obterStatsRaw(
  DB: D1Database,
  empresa_id: number,
  inicio: string,
  fim: string,
  costureiro_id?: number
): Promise<StatsRaw[]> {
  let sql = `
    SELECT
      c.id AS costureiro_id,
      c.nome,
      c.tipo_maquina,
      COALESCE(SUM(p.quantidade_produzida), 0) AS total_producao,
      COALESCE(SUM(p.minutos_trabalhados), 0) AS total_minutos_trabalhados,
      COALESCE(SUM(p.quantidade_produzida * p.tempo_padrao_min), 0) AS total_minutos_produzidos,
      COALESCE(SUM(p.quantidade_produzida * p.tempo_padrao_min * COALESCE(o.grau_dificuldade, 1.0)), 0) AS total_minutos_produzidos_ponderados,
      COALESCE(COUNT(DISTINCT p.data), 0) AS dias_trabalhados,
      COALESCE(SUM(p.retrabalho), 0) AS retrabalho_total,
      COALESCE(COUNT(p.id), 0) AS total_registros
    FROM costureiros c
    LEFT JOIN producao p
      ON p.costureiro_id = c.id
      AND p.data BETWEEN ? AND ?
      AND p.empresa_id = ?
    LEFT JOIN operacoes o ON o.id = p.operacao_id
    WHERE c.empresa_id = ? AND c.ativo = 1
  `
  const params: any[] = [inicio, fim, empresa_id, empresa_id]
  if (costureiro_id) { sql += ' AND c.id = ?'; params.push(costureiro_id) }
  sql += ' GROUP BY c.id, c.nome, c.tipo_maquina ORDER BY c.nome'
  const { results } = await DB.prepare(sql).bind(...params).all<StatsRaw>()
  return results
}

/**
 * Helper: lê a EFICIÊNCIA GERAL DO MÊS (em %) lançada para o período.
 *
 * Replica AG8 da planilha. Pode ser:
 *  - manual (admin/gestor lançou)  → retornado direto
 *  - automático: se nunca lançou, calculamos a partir das produções
 *    como SUM(min_efetivo) / SUM(min_disp) × 100  (idêntico ao Excel)
 */
async function getEficienciaGeralMes(
  DB: D1Database,
  empresa_id: number,
  ano: number,
  mes: number,
  raws?: StatsRaw[]
): Promise<{ eficiencia_pct: number; manual: boolean }> {
  const row = await DB.prepare(
    'SELECT eficiencia_pct FROM bonificacao_geral WHERE empresa_id = ? AND ano = ? AND mes = ?'
  ).bind(empresa_id, ano, mes).first<{ eficiencia_pct: number | null }>()

  if (row && row.eficiencia_pct != null && Number(row.eficiencia_pct) > 0) {
    return { eficiencia_pct: Number(row.eficiencia_pct), manual: true }
  }

  // Cálculo automático a partir dos dados (idêntico à planilha)
  if (raws && raws.length) {
    const totalEfet = raws.reduce((s, r) => s + (r.total_minutos_produzidos || 0), 0)
    const totalDisp = raws.reduce((s, r) => s + (r.total_minutos_trabalhados || 0), 0)
    if (totalDisp > 0) {
      return { eficiencia_pct: Number(((totalEfet / totalDisp) * 100).toFixed(2)), manual: false }
    }
  }
  return { eficiencia_pct: 0, manual: false }
}

app.get('/api/stats', async (c) => {
  const eid = await getEmpresaId(c)
  const hoje = new Date()
  const ano = Number(c.req.query('ano')) || hoje.getUTCFullYear()
  const mes = Number(c.req.query('mes')) || (hoje.getUTCMonth() + 1)
  const inicio = c.req.query('inicio') || rangeDoMes(ano, mes).inicio
  const fim = c.req.query('fim') || rangeDoMes(ano, mes).fim

  const [config, raws] = await Promise.all([
    getConfig(c.env.DB, eid),
    obterStatsRaw(c.env.DB, eid, inicio, fim),
  ])
  const eficGeral = await getEficienciaGeralMes(c.env.DB, eid, ano, mes, raws)

  const costureirosStats = raws.map((r) => consolidarEstatisticas(r, config, eficGeral.eficiencia_pct))
  const totalProducao = costureirosStats.reduce((s, x) => s + x.total_producao, 0)
  const totalIndividual = costureirosStats.reduce((s, x) => s + x.bonificacao_individual, 0)
  const totalFinal = costureirosStats.reduce((s, x) => s + x.bonificacao_final, 0)
  // Bonificação Geral $ (mesmo valor para todos) — é o mesmo de cada costureiro
  const bonificacaoGeralValor = costureirosStats[0]?.bonificacao_geral || 0
  const eficienciaMedia = costureirosStats.length
    ? costureirosStats.reduce((s, x) => s + x.eficiencia, 0) / costureirosStats.length : 0
  const comBonus = costureirosStats.filter((x) => x.bonificacao_final > 0).length

  return c.json({
    periodo: { inicio, fim, ano, mes },
    config,
    eficiencia_geral_mes: eficGeral.eficiencia_pct,
    eficiencia_geral_manual: eficGeral.manual,
    bonificacao_geral_valor: bonificacaoGeralValor,
    // alias antigo p/ compatibilidade do front: passa a refletir a EFICIÊNCIA GERAL EM %
    bonificacao_geral: eficGeral.eficiencia_pct,
    kpis: {
      total_costureiros: costureirosStats.length,
      total_producao: totalProducao,
      eficiencia_media: Number(eficienciaMedia.toFixed(2)),
      eficiencia_geral_mes: eficGeral.eficiencia_pct,
      bonificacao_geral_valor: bonificacaoGeralValor,
      bonificacao_geral: bonificacaoGeralValor, // alias
      total_bonificacao_individual: Number(totalIndividual.toFixed(2)),
      total_bonificacao_final: Number(totalFinal.toFixed(2)),
      total_bonus: Number(totalFinal.toFixed(2)),
      costureiros_com_bonus: comBonus,
      alto_desempenho: costureirosStats.filter((x) => x.classe === 'alto').length,
      medio_desempenho: costureirosStats.filter((x) => x.classe === 'medio').length,
      baixo_desempenho: costureirosStats.filter((x) => x.classe === 'baixo').length,
    },
    costureiros: costureirosStats,
  })
})

/* =============================================================
 *  API — EFICIÊNCIA GERAL DO MÊS (AG8 da planilha)
 *
 *  A planilha tem um campo "Eficiência mês" preenchido manualmente
 *  pelo administrador. A partir dele a Bonificação Geral $ é calculada
 *  como (efic - 0,75) × 20 × 50.
 *
 *  Se o admin não lançar, calculamos automaticamente:
 *      efic_mes = SUM(min_efetivos) / SUM(min_disp) × 100
 *  (idêntico ao Excel)
 * ============================================================= */

// GET por ano/mês
app.get('/api/bonificacao-geral', async (c) => {
  const eid = await getEmpresaId(c)
  const hoje = new Date()
  const ano = Number(c.req.query('ano')) || hoje.getUTCFullYear()
  const mes = Number(c.req.query('mes')) || (hoje.getUTCMonth() + 1)
  const row = await c.env.DB.prepare(
    'SELECT id, empresa_id, ano, mes, valor, eficiencia_pct, observacao, updated_at FROM bonificacao_geral WHERE empresa_id = ? AND ano = ? AND mes = ?'
  ).bind(eid, ano, mes).first<any>()

  // Calcula automático se não existir
  if (!row || row.eficiencia_pct == null || row.eficiencia_pct <= 0) {
    const { inicio, fim } = rangeDoMes(ano, mes)
    const raws = await obterStatsRaw(c.env.DB, eid, inicio, fim)
    const auto = await getEficienciaGeralMes(c.env.DB, eid, ano, mes, raws)
    return c.json({
      empresa_id: eid, ano, mes,
      eficiencia_pct: auto.eficiencia_pct,
      manual: false,
      valor: calcularComponenteBonificacao(auto.eficiencia_pct) > 0
        ? Math.round(calcularComponenteBonificacao(auto.eficiencia_pct) * 100) / 100
        : 0,
      observacao: row?.observacao ?? null,
    })
  }

  return c.json({
    ...row,
    manual: true,
    valor: calcularComponenteBonificacao(Number(row.eficiencia_pct)) > 0
      ? Math.round(calcularComponenteBonificacao(Number(row.eficiencia_pct)) * 100) / 100
      : 0,
  })
})

// Histórico
app.get('/api/bonificacao-geral/historico', async (c) => {
  const eid = await getEmpresaId(c)
  const { results } = await c.env.DB.prepare(
    'SELECT id, ano, mes, valor, eficiencia_pct, observacao, updated_at FROM bonificacao_geral WHERE empresa_id = ? ORDER BY ano DESC, mes DESC LIMIT 24'
  ).bind(eid).all()
  return c.json(results)
})

// PUT (upsert) — apenas admin/gestor podem editar
// Aceita `eficiencia_pct` (preferido, em %, ex.: 78 = 78%) ou `valor` (R$, legado)
app.put('/api/bonificacao-geral', authMiddleware, requireRole('admin', 'gestor'), async (c) => {
  const u = c.get('user')
  const body = await c.req.json<{ ano: number; mes: number; eficiencia_pct?: number; valor?: number; observacao?: string }>()
  const ano = Number(body.ano)
  const mes = Number(body.mes)

  if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    return c.json({ error: 'Período inválido (ano/mês)' }, 400)
  }

  let eficienciaPct: number
  if (Number.isFinite(body.eficiencia_pct)) {
    eficienciaPct = Number(body.eficiencia_pct)
  } else if (Number.isFinite(body.valor)) {
    // Compat: converter valor R$ para eficiência. valor = (e/100 - 0,75) × 20 × 50 → e = 100 × (valor/1000 + 0,75)
    const v = Number(body.valor)
    eficienciaPct = v > 0 ? 100 * (v / 1000 + 0.75) : 0
  } else {
    return c.json({ error: 'Informe eficiencia_pct (em %) ou valor (R$)' }, 400)
  }

  if (!Number.isFinite(eficienciaPct) || eficienciaPct < 0 || eficienciaPct > 200) {
    return c.json({ error: 'Eficiência deve estar entre 0 e 200%' }, 400)
  }

  const eficRound = Math.round(eficienciaPct * 100) / 100
  const valorCalc = calcularComponenteBonificacao(eficRound)
  const valorCache = valorCalc > 0 ? Math.round(valorCalc * 100) / 100 : 0
  const obs = (body.observacao || '').slice(0, 500) || null

  await c.env.DB.prepare(`
    INSERT INTO bonificacao_geral (empresa_id, ano, mes, valor, eficiencia_pct, observacao, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(empresa_id, ano, mes) DO UPDATE SET
      valor = excluded.valor,
      eficiencia_pct = excluded.eficiencia_pct,
      observacao = excluded.observacao,
      updated_at = CURRENT_TIMESTAMP
  `).bind(u.empresa_id, ano, mes, valorCache, eficRound, obs).run()

  try {
    await c.env.DB.prepare(
      'INSERT INTO auditoria (empresa_id, usuario_id, acao, entidade, detalhes) VALUES (?, ?, ?, ?, ?)'
    ).bind(u.empresa_id, u.sub, 'update', 'bonificacao_geral',
           JSON.stringify({ ano, mes, eficiencia_pct: eficRound, valor: valorCache, obs })).run()
  } catch {}

  const row = await c.env.DB.prepare(
    'SELECT id, empresa_id, ano, mes, valor, eficiencia_pct, observacao, updated_at FROM bonificacao_geral WHERE empresa_id = ? AND ano = ? AND mes = ?'
  ).bind(u.empresa_id, ano, mes).first<any>()

  return c.json({ ok: true, bonificacao_geral: { ...row, manual: true } })
})

// DELETE — Reseta a Eficiência Geral para cálculo automático
// Remove o registro manual da bonificação geral do mês — backend volta a calcular automaticamente.
app.delete('/api/bonificacao-geral', authMiddleware, requireRole('admin', 'gestor'), async (c) => {
  const u = c.get('user')
  const ano = Number(c.req.query('ano'))
  const mes = Number(c.req.query('mes'))
  if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    return c.json({ error: 'Período inválido (ano/mês)' }, 400)
  }
  const r = await c.env.DB.prepare(
    'DELETE FROM bonificacao_geral WHERE empresa_id = ? AND ano = ? AND mes = ?'
  ).bind(u.empresa_id, ano, mes).run()
  try {
    await c.env.DB.prepare(
      'INSERT INTO auditoria (empresa_id, usuario_id, acao, entidade, detalhes) VALUES (?, ?, ?, ?, ?)'
    ).bind(u.empresa_id, u.sub, 'reset', 'bonificacao_geral',
           JSON.stringify({ ano, mes, removidos: r.meta?.changes ?? 0 })).run()
  } catch {}
  return c.json({ ok: true, removidos: r.meta?.changes ?? 0, ano, mes })
})

/* =============================================================
 *  API — LIMPAR MÊS COMPLETO (admin only)
 *
 *  Remove TODOS os dados de um mês específico:
 *    - producao (registros do mês)
 *    - bonificacao_geral (eficiência manual do mês)
 *
 *  NÃO afeta outros meses, costureiros, operações ou config.
 *  Operação destrutiva — exige role admin.
 * ============================================================= */
app.post('/api/admin/limpar-mes', authMiddleware, requireRole('admin'), async (c) => {
  const u = c.get('user')
  const body = await c.req.json<{ ano: number; mes: number; confirmar?: string }>().catch(() => ({} as any))
  const ano = Number(body.ano)
  const mes = Number(body.mes)

  if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    return c.json({ error: 'Período inválido (ano/mês)' }, 400)
  }
  if (ano < 2000 || ano > 2100) {
    return c.json({ error: 'Ano fora do intervalo permitido (2000–2100)' }, 400)
  }
  // Confirmação textual obrigatória — protege contra cliques acidentais
  const expected = `LIMPAR ${String(mes).padStart(2, '0')}/${ano}`
  if ((body.confirmar || '').trim().toUpperCase() !== expected) {
    return c.json({
      error: `Confirmação obrigatória. Envie confirmar="${expected}"`,
      esperado: expected,
    }, 400)
  }

  const { inicio, fim } = rangeDoMes(ano, mes)

  // 1) Conta antes (para o log de auditoria e resposta)
  const cntProd = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM producao WHERE empresa_id = ? AND data BETWEEN ? AND ?'
  ).bind(u.empresa_id, inicio, fim).first<{ n: number }>()

  const cntBon = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM bonificacao_geral WHERE empresa_id = ? AND ano = ? AND mes = ?'
  ).bind(u.empresa_id, ano, mes).first<{ n: number }>()

  // 2) Apaga (em sequência — D1 não tem transação multi-statement no batch padrão)
  const delProd = await c.env.DB.prepare(
    'DELETE FROM producao WHERE empresa_id = ? AND data BETWEEN ? AND ?'
  ).bind(u.empresa_id, inicio, fim).run()

  const delBon = await c.env.DB.prepare(
    'DELETE FROM bonificacao_geral WHERE empresa_id = ? AND ano = ? AND mes = ?'
  ).bind(u.empresa_id, ano, mes).run()

  // 3) Auditoria
  try {
    await c.env.DB.prepare(
      'INSERT INTO auditoria (empresa_id, usuario_id, acao, entidade, detalhes) VALUES (?, ?, ?, ?, ?)'
    ).bind(u.empresa_id, u.sub, 'purge_month', 'producao+bonificacao_geral',
           JSON.stringify({
             ano, mes, inicio, fim,
             producao_removida: delProd.meta?.changes ?? 0,
             bonificacao_removida: delBon.meta?.changes ?? 0,
           })).run()
  } catch {}

  return c.json({
    ok: true,
    ano, mes,
    periodo: { inicio, fim },
    producao_removida: delProd.meta?.changes ?? cntProd?.n ?? 0,
    bonificacao_removida: delBon.meta?.changes ?? cntBon?.n ?? 0,
    mensagem: `Dados de ${String(mes).padStart(2, '0')}/${ano} removidos com sucesso.`,
  })
})

app.get('/api/stats/evolucao', async (c) => {
  const eid = await getEmpresaId(c)
  const hoje = new Date()
  const ano = Number(c.req.query('ano')) || hoje.getUTCFullYear()
  const mes = Number(c.req.query('mes')) || (hoje.getUTCMonth() + 1)
  const { inicio, fim } = rangeDoMes(ano, mes)

  const { results } = await c.env.DB.prepare(`
    SELECT
      p.data,
      SUM(p.quantidade_produzida) AS producao,
      SUM(p.minutos_trabalhados) AS minutos_trabalhados,
      SUM(p.quantidade_produzida * p.tempo_padrao_min) AS minutos_produzidos,
      SUM(p.retrabalho) AS retrabalho
    FROM producao p
    WHERE p.empresa_id = ? AND p.data BETWEEN ? AND ?
    GROUP BY p.data
    ORDER BY p.data ASC
  `).bind(eid, inicio, fim).all<any>()

  const serie = results.map((r: any) => ({
    data: r.data,
    producao: r.producao || 0,
    eficiencia: r.minutos_trabalhados > 0
      ? Number(((r.minutos_produzidos / r.minutos_trabalhados) * 100).toFixed(2))
      : 0,
    retrabalho: r.retrabalho || 0,
  }))

  return c.json({ periodo: { inicio, fim }, serie })
})

app.get('/api/stats/costureiro/:id', async (c) => {
  const eid = await getEmpresaId(c)
  const id = Number(c.req.param('id'))
  const hoje = new Date()
  const ano = Number(c.req.query('ano')) || hoje.getUTCFullYear()
  const mes = Number(c.req.query('mes')) || (hoje.getUTCMonth() + 1)
  const { inicio, fim } = rangeDoMes(ano, mes)

  const [config, raws, serie] = await Promise.all([
    getConfig(c.env.DB, eid),
    obterStatsRaw(c.env.DB, eid, inicio, fim, id),
    c.env.DB.prepare(`
      SELECT
        p.data,
        SUM(p.quantidade_produzida) AS producao,
        SUM(p.minutos_trabalhados) AS minutos_trabalhados,
        SUM(p.quantidade_produzida * p.tempo_padrao_min) AS minutos_produzidos,
        SUM(p.retrabalho) AS retrabalho
      FROM producao p
      WHERE p.empresa_id = ? AND p.costureiro_id = ? AND p.data BETWEEN ? AND ?
      GROUP BY p.data
      ORDER BY p.data ASC
    `).bind(eid, id, inicio, fim).all<any>(),
  ])

  if (raws.length === 0)
    return c.json({ error: 'Costureiro não encontrado' }, 404)

  // Eficiência geral do mês (manual ou automática a partir de TODOS os costureiros)
  const allRaws = await obterStatsRaw(c.env.DB, eid, inicio, fim)
  const eficGeral = await getEficienciaGeralMes(c.env.DB, eid, ano, mes, allRaws)

  const stats = consolidarEstatisticas(raws[0], config, eficGeral.eficiencia_pct)
  const diario = serie.results.map((r: any) => ({
    data: r.data,
    producao: r.producao || 0,
    eficiencia: r.minutos_trabalhados > 0
      ? Number(((r.minutos_produzidos / r.minutos_trabalhados) * 100).toFixed(2))
      : 0,
    retrabalho: r.retrabalho || 0,
  }))

  const historico = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1))
    const hMes = d.getUTCMonth() + 1
    const hAno = d.getUTCFullYear()
    const range = rangeDoMes(hAno, hMes)
    const rAll = await obterStatsRaw(c.env.DB, eid, range.inicio, range.fim)
    const rOne = await obterStatsRaw(c.env.DB, eid, range.inicio, range.fim, id)
    const eg = await getEficienciaGeralMes(c.env.DB, eid, hAno, hMes, rAll)
    const s = rOne.length ? consolidarEstatisticas(rOne[0], config, eg.eficiencia_pct) : null
    historico.push({
      ano: hAno, mes: hMes,
      label: `${String(hMes).padStart(2, '0')}/${hAno}`,
      eficiencia: s?.eficiencia || 0,
      producao: s?.total_producao || 0,
      bonificacao_individual: s?.bonificacao_individual || 0,
      bonificacao_geral: s?.bonificacao_geral || 0,
      eficiencia_geral_mes: eg.eficiencia_pct,
      bonificacao_final: s?.bonificacao_final || 0,
      bonus: s?.bonificacao_final || 0, // compat
    })
  }

  return c.json({
    periodo: { inicio, fim, ano, mes },
    eficiencia_geral_mes: eficGeral.eficiencia_pct,
    eficiencia_geral_manual: eficGeral.manual,
    bonificacao_geral: stats.bonificacao_geral,
    stats, diario, historico,
  })
})

app.post('/api/simulacao', async (c) => {
  const eid = await getEmpresaId(c)
  const body = await c.req.json<Partial<MetasConfig> & {
    ano?: number; mes?: number;
    eficiencia_geral_pct?: number;   // novo (preferido)
    bonificacao_geral?: number;      // legado: aceita como % se ≤ 200, senão como R$
  }>()
  const hoje = new Date()
  const ano = body.ano || hoje.getUTCFullYear()
  const mes = body.mes || (hoje.getUTCMonth() + 1)
  const { inicio, fim } = rangeDoMes(ano, mes)

  const cfgBase = await getConfig(c.env.DB, eid)
  const cfg: MetasConfig = { ...cfgBase, ...body }

  const raws = await obterStatsRaw(c.env.DB, eid, inicio, fim)
  const eficGeralReal = await getEficienciaGeralMes(c.env.DB, eid, ano, mes, raws)

  // Permite simular eficiência geral do mês (em %)
  let eficGeralSim = eficGeralReal.eficiencia_pct
  if (Number.isFinite(body.eficiencia_geral_pct as number) && (body.eficiencia_geral_pct as number) >= 0) {
    eficGeralSim = Number(body.eficiencia_geral_pct)
  } else if (Number.isFinite(body.bonificacao_geral as number) && (body.bonificacao_geral as number) >= 0) {
    const v = Number(body.bonificacao_geral)
    eficGeralSim = v <= 200 ? v : 100 * (v / 1000 + 0.75)  // converte R$ legado em %
  }

  const costureirosStats = raws.map((r) => consolidarEstatisticas(r, cfg, eficGeralSim))
  const totalIndividual = costureirosStats.reduce((s, x) => s + x.bonificacao_individual, 0)
  const totalFinal = costureirosStats.reduce((s, x) => s + x.bonificacao_final, 0)
  const bonGeralValor = costureirosStats[0]?.bonificacao_geral || 0
  const comBonus = costureirosStats.filter((x) => x.bonificacao_final > 0).length

  return c.json({
    periodo: { inicio, fim, ano, mes },
    config_simulada: cfg,
    eficiencia_geral_mes: eficGeralSim,
    bonificacao_geral_valor: bonGeralValor,
    bonificacao_geral: bonGeralValor, // compat
    total_bonificacao_individual: Number(totalIndividual.toFixed(2)),
    total_bonificacao_final: Number(totalFinal.toFixed(2)),
    total_bonus: Number(totalFinal.toFixed(2)),
    costureiros_com_bonus: comBonus,
    costureiros: costureirosStats,
  })
})

/* =============================================================
 *  API — GESTÃO DE USUÁRIOS (admin)
 * ============================================================= */
app.get('/api/usuarios', authMiddleware, requireRole('admin'), async (c) => {
  const u = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT id, email, nome, role, ativo, ultimo_login, created_at FROM usuarios WHERE empresa_id = ? ORDER BY nome'
  ).bind(u.empresa_id).all()
  return c.json(results)
})

app.post('/api/usuarios', authMiddleware, requireRole('admin'), async (c) => {
  const u = c.get('user')
  const body = await c.req.json<any>()
  if (!body.email || !body.senha || !body.nome)
    return c.json({ error: 'Campos obrigatórios' }, 400)
  const email = body.email.toLowerCase().trim()
  const existente = await c.env.DB.prepare('SELECT id FROM usuarios WHERE email = ?').bind(email).first()
  if (existente) return c.json({ error: 'E-mail já cadastrado' }, 400)
  const senha_hash = await hashPassword(body.senha)
  const r = await c.env.DB.prepare(
    'INSERT INTO usuarios (empresa_id, email, nome, senha_hash, role, ativo) VALUES (?, ?, ?, ?, ?, 1)'
  ).bind(u.empresa_id, email, body.nome.trim(), senha_hash, body.role || 'operador').run()
  return c.json({ id: r.meta.last_row_id })
})

app.put('/api/usuarios/:id', authMiddleware, requireRole('admin'), async (c) => {
  const u = c.get('user')
  const id = Number(c.req.param('id'))
  const body = await c.req.json<any>()
  const updates: string[] = []
  const params: any[] = []
  if (body.nome) { updates.push('nome = ?'); params.push(body.nome.trim()) }
  if (body.role) { updates.push('role = ?'); params.push(body.role) }
  if (body.ativo !== undefined) { updates.push('ativo = ?'); params.push(body.ativo ? 1 : 0) }
  if (body.senha) { updates.push('senha_hash = ?'); params.push(await hashPassword(body.senha)) }
  if (updates.length === 0) return c.json({ ok: true })
  params.push(id, u.empresa_id)
  await c.env.DB.prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ? AND empresa_id = ?`)
    .bind(...params).run()
  return c.json({ ok: true })
})

app.delete('/api/usuarios/:id', authMiddleware, requireRole('admin'), async (c) => {
  const u = c.get('user')
  const id = Number(c.req.param('id'))
  if (id === u.sub) return c.json({ error: 'Você não pode se auto-excluir' }, 400)
  await c.env.DB.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ? AND empresa_id = ?')
    .bind(id, u.empresa_id).run()
  return c.json({ ok: true })
})

/* =============================================================
 *  PÁGINA ÚNICA (SPA) — catch-all para fallback
 * ============================================================= */
const renderSpa = (c: any) => {
  return c.render(
    <>
      <div id="app" class="min-h-screen"></div>
      <script src="/static/app.js"></script>
    </>
  )
}

app.get('/', renderSpa)
// Fallback SPA: qualquer rota não-API e não-estática renderiza o index
app.get('*', async (c, next) => {
  const path = c.req.path
  // deixa API e estáticos passarem normalmente
  if (path.startsWith('/api/') || path.startsWith('/static/')) return next()
  return renderSpa(c)
})

export default app
