import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { renderer } from './renderer'
import type { Bindings, MetasConfig } from './types'
import { consolidarEstatisticas, rangeDoMes, type StatsRaw } from './business'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use(renderer)

/* =============================================================
 *  HELPERS
 * ============================================================= */
async function getConfig(DB: D1Database, empresa_id = 1): Promise<MetasConfig> {
  const cfg = await DB.prepare('SELECT * FROM metas_config WHERE empresa_id = ?')
    .bind(empresa_id)
    .first<MetasConfig>()
  if (cfg) return cfg
  // fallback defaults (se banco vazio)
  return {
    id: 0,
    empresa_id,
    eficiencia_minima: 70,
    eficiencia_meta: 85,
    eficiencia_excelente: 100,
    bonus_faixa_1: 100,
    bonus_faixa_2: 250,
    bonus_faixa_3: 400,
    bonus_faixa_4: 600,
    frequencia_minima: 90,
    retrabalho_limite: 5,
    dias_uteis_mes: 22,
    minutos_dia_util: 480,
  }
}

/* =============================================================
 *  API — HEALTH / META
 * ============================================================= */
app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))

app.get('/api/config', async (c) => {
  const cfg = await getConfig(c.env.DB)
  return c.json(cfg)
})

app.put('/api/config', async (c) => {
  const body = await c.req.json<Partial<MetasConfig>>()
  const cfg = await getConfig(c.env.DB)
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
      merged.empresa_id || 1
    )
    .run()
  return c.json({ ok: true, config: merged })
})

/* =============================================================
 *  API — COSTUREIROS
 * ============================================================= */
app.get('/api/costureiros', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM costureiros WHERE empresa_id = 1 ORDER BY nome'
  ).all()
  return c.json(results)
})

app.post('/api/costureiros', async (c) => {
  const body = await c.req.json<{ nome: string; tipo_maquina?: string; data_admissao?: string }>()
  if (!body.nome || body.nome.trim() === '')
    return c.json({ error: 'Nome é obrigatório' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO costureiros (empresa_id, nome, tipo_maquina, data_admissao) VALUES (1, ?, ?, ?)'
  )
    .bind(body.nome.trim().toUpperCase(), body.tipo_maquina || 'reta', body.data_admissao || null)
    .run()
  return c.json({ id: r.meta.last_row_id, ...body })
})

app.put('/api/costureiros/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<any>()
  await c.env.DB.prepare(
    'UPDATE costureiros SET nome=?, tipo_maquina=?, ativo=? WHERE id=?'
  )
    .bind(
      (body.nome || '').trim().toUpperCase(),
      body.tipo_maquina || 'reta',
      body.ativo ?? 1,
      id
    )
    .run()
  return c.json({ ok: true })
})

app.delete('/api/costureiros/:id', async (c) => {
  const id = Number(c.req.param('id'))
  // soft delete
  await c.env.DB.prepare('UPDATE costureiros SET ativo=0 WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

/* =============================================================
 *  API — OPERAÇÕES
 * ============================================================= */
app.get('/api/operacoes', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM operacoes WHERE empresa_id = 1 AND ativo = 1 ORDER BY nome_operacao'
  ).all()
  return c.json(results)
})

app.post('/api/operacoes', async (c) => {
  const body = await c.req.json<any>()
  const r = await c.env.DB.prepare(
    'INSERT INTO operacoes (empresa_id, nome_operacao, grau_dificuldade, tempo_padrao_min) VALUES (1, ?, ?, ?)'
  )
    .bind(body.nome_operacao, body.grau_dificuldade || 1.0, body.tempo_padrao_min || 0)
    .run()
  return c.json({ id: r.meta.last_row_id })
})

app.put('/api/operacoes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<any>()
  await c.env.DB.prepare(
    'UPDATE operacoes SET nome_operacao=?, grau_dificuldade=?, tempo_padrao_min=? WHERE id=?'
  )
    .bind(body.nome_operacao, body.grau_dificuldade || 1.0, body.tempo_padrao_min || 0, id)
    .run()
  return c.json({ ok: true })
})

app.delete('/api/operacoes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('UPDATE operacoes SET ativo=0 WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

/* =============================================================
 *  API — PRODUÇÃO
 * ============================================================= */
app.get('/api/producao', async (c) => {
  const inicio = c.req.query('inicio')
  const fim = c.req.query('fim')
  const costureiro_id = c.req.query('costureiro_id')
  let sql = `
    SELECT p.*, c.nome AS costureiro_nome, c.tipo_maquina
    FROM producao p
    JOIN costureiros c ON c.id = p.costureiro_id
    WHERE p.empresa_id = 1
  `
  const params: any[] = []
  if (inicio) { sql += ' AND p.data >= ?'; params.push(inicio) }
  if (fim) { sql += ' AND p.data <= ?'; params.push(fim) }
  if (costureiro_id) { sql += ' AND p.costureiro_id = ?'; params.push(Number(costureiro_id)) }
  sql += ' ORDER BY p.data DESC, p.id DESC LIMIT 2000'
  const stmt = c.env.DB.prepare(sql)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all()
  return c.json(results)
})

app.post('/api/producao', async (c) => {
  const body = await c.req.json<any>()
  if (!body.costureiro_id || !body.data)
    return c.json({ error: 'costureiro_id e data são obrigatórios' }, 400)
  const r = await c.env.DB.prepare(
    `INSERT INTO producao
      (empresa_id, data, costureiro_id, operacao_id, operacao, referencia_peca,
       tempo_padrao_min, quantidade_produzida, minutos_trabalhados, retrabalho)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.data,
      Number(body.costureiro_id),
      body.operacao_id || null,
      body.operacao || null,
      body.referencia_peca || null,
      Number(body.tempo_padrao_min) || 0,
      Number(body.quantidade_produzida) || 0,
      Number(body.minutos_trabalhados) || 0,
      Number(body.retrabalho) || 0,
    )
    .run()
  return c.json({ id: r.meta.last_row_id })
})

app.put('/api/producao/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<any>()
  await c.env.DB.prepare(
    `UPDATE producao SET
      data=?, costureiro_id=?, operacao_id=?, operacao=?, referencia_peca=?,
      tempo_padrao_min=?, quantidade_produzida=?, minutos_trabalhados=?, retrabalho=?
      WHERE id=?`
  )
    .bind(
      body.data, Number(body.costureiro_id), body.operacao_id || null,
      body.operacao || null, body.referencia_peca || null,
      Number(body.tempo_padrao_min) || 0,
      Number(body.quantidade_produzida) || 0,
      Number(body.minutos_trabalhados) || 0,
      Number(body.retrabalho) || 0,
      id
    )
    .run()
  return c.json({ ok: true })
})

app.delete('/api/producao/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM producao WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

/* =============================================================
 *  API — ESTATÍSTICAS (KPIs / RANKING / PERFIL)
 * ============================================================= */
async function obterStatsRaw(
  DB: D1Database,
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
    LEFT JOIN operacoes o ON o.id = p.operacao_id
    WHERE c.empresa_id = 1 AND c.ativo = 1
  `
  const params: any[] = [inicio, fim]
  if (costureiro_id) { sql += ' AND c.id = ?'; params.push(costureiro_id) }
  sql += ' GROUP BY c.id, c.nome, c.tipo_maquina ORDER BY c.nome'
  const { results } = await DB.prepare(sql).bind(...params).all<StatsRaw>()
  return results
}

app.get('/api/stats', async (c) => {
  const hoje = new Date()
  const ano = Number(c.req.query('ano')) || hoje.getUTCFullYear()
  const mes = Number(c.req.query('mes')) || (hoje.getUTCMonth() + 1)
  const inicio = c.req.query('inicio') || rangeDoMes(ano, mes).inicio
  const fim = c.req.query('fim') || rangeDoMes(ano, mes).fim

  const [config, raws] = await Promise.all([
    getConfig(c.env.DB),
    obterStatsRaw(c.env.DB, inicio, fim),
  ])

  const costureirosStats = raws.map((r) => consolidarEstatisticas(r, config))

  // KPIs globais
  const totalProducao = costureirosStats.reduce((s, x) => s + x.total_producao, 0)
  const totalBonus = costureirosStats.reduce((s, x) => s + x.bonus, 0)
  const eficienciaMedia = costureirosStats.length
    ? costureirosStats.reduce((s, x) => s + x.eficiencia, 0) / costureirosStats.length
    : 0
  const comBonus = costureirosStats.filter((x) => x.bonus > 0).length

  return c.json({
    periodo: { inicio, fim, ano, mes },
    config,
    kpis: {
      total_costureiros: costureirosStats.length,
      total_producao: totalProducao,
      eficiencia_media: Number(eficienciaMedia.toFixed(2)),
      total_bonus: totalBonus,
      costureiros_com_bonus: comBonus,
      alto_desempenho: costureirosStats.filter((x) => x.classe === 'alto').length,
      medio_desempenho: costureirosStats.filter((x) => x.classe === 'medio').length,
      baixo_desempenho: costureirosStats.filter((x) => x.classe === 'baixo').length,
    },
    costureiros: costureirosStats,
  })
})

app.get('/api/stats/evolucao', async (c) => {
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
    WHERE p.empresa_id = 1 AND p.data BETWEEN ? AND ?
    GROUP BY p.data
    ORDER BY p.data ASC
  `).bind(inicio, fim).all<any>()

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
  const id = Number(c.req.param('id'))
  const hoje = new Date()
  const ano = Number(c.req.query('ano')) || hoje.getUTCFullYear()
  const mes = Number(c.req.query('mes')) || (hoje.getUTCMonth() + 1)
  const { inicio, fim } = rangeDoMes(ano, mes)

  const [config, raws, serie] = await Promise.all([
    getConfig(c.env.DB),
    obterStatsRaw(c.env.DB, inicio, fim, id),
    c.env.DB.prepare(`
      SELECT
        p.data,
        SUM(p.quantidade_produzida) AS producao,
        SUM(p.minutos_trabalhados) AS minutos_trabalhados,
        SUM(p.quantidade_produzida * p.tempo_padrao_min) AS minutos_produzidos,
        SUM(p.retrabalho) AS retrabalho
      FROM producao p
      WHERE p.empresa_id = 1 AND p.costureiro_id = ? AND p.data BETWEEN ? AND ?
      GROUP BY p.data
      ORDER BY p.data ASC
    `).bind(id, inicio, fim).all<any>(),
  ])

  if (raws.length === 0)
    return c.json({ error: 'Costureiro não encontrado' }, 404)

  const stats = consolidarEstatisticas(raws[0], config)
  const diario = serie.results.map((r: any) => ({
    data: r.data,
    producao: r.producao || 0,
    eficiencia: r.minutos_trabalhados > 0
      ? Number(((r.minutos_produzidos / r.minutos_trabalhados) * 100).toFixed(2))
      : 0,
    retrabalho: r.retrabalho || 0,
  }))

  // Histórico dos últimos 6 meses (eficiência mensal)
  const historico = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1))
    const hMes = d.getUTCMonth() + 1
    const hAno = d.getUTCFullYear()
    const range = rangeDoMes(hAno, hMes)
    const r = await obterStatsRaw(c.env.DB, range.inicio, range.fim, id)
    const s = r.length ? consolidarEstatisticas(r[0], config) : null
    historico.push({
      ano: hAno,
      mes: hMes,
      label: `${String(hMes).padStart(2, '0')}/${hAno}`,
      eficiencia: s?.eficiencia || 0,
      producao: s?.total_producao || 0,
      bonus: s?.bonus || 0,
    })
  }

  return c.json({
    periodo: { inicio, fim, ano, mes },
    stats,
    diario,
    historico,
  })
})

/* =============================================================
 *  API — SIMULAÇÃO DE BONIFICAÇÃO
 * ============================================================= */
app.post('/api/simulacao', async (c) => {
  const body = await c.req.json<Partial<MetasConfig> & { ano?: number; mes?: number }>()
  const hoje = new Date()
  const ano = body.ano || hoje.getUTCFullYear()
  const mes = body.mes || (hoje.getUTCMonth() + 1)
  const { inicio, fim } = rangeDoMes(ano, mes)

  const cfgBase = await getConfig(c.env.DB)
  const cfg: MetasConfig = { ...cfgBase, ...body }

  const raws = await obterStatsRaw(c.env.DB, inicio, fim)
  const costureirosStats = raws.map((r) => consolidarEstatisticas(r, cfg))
  const totalBonus = costureirosStats.reduce((s, x) => s + x.bonus, 0)

  return c.json({
    periodo: { inicio, fim, ano, mes },
    config_simulada: cfg,
    total_bonus: totalBonus,
    costureiros: costureirosStats,
  })
})

/* =============================================================
 *  PÁGINA ÚNICA (SPA)
 * ============================================================= */
app.get('/', (c) => {
  return c.render(
    <>
      <div id="app" class="min-h-screen"></div>
      <script src="/static/app.js"></script>
    </>
  )
})

export default app
