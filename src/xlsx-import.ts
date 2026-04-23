import * as XLSX from 'xlsx'

/**
 * Importador inteligente de planilhas de produção/bonificação.
 *
 * Suporta dois formatos:
 * 1. Planilha "BONIFICAÇÃO MENSAL" (1 aba por costureiro, layout fixo SENAI)
 *    - lê o nome do colaborador da célula C3
 *    - extrai produção diária das linhas SEGUNDA/TERÇA/.../SEXTA
 * 2. Planilha simples (1 aba com cabeçalho: data, costureiro, operacao, tempo_padrao_min,
 *    quantidade_produzida, minutos_trabalhados, retrabalho, referencia_peca)
 */

export interface ImportStats {
  costureiros_criados: number
  costureiros_encontrados: number
  operacoes_criadas: number
  producoes_inseridas: number
  avisos: string[]
  erros: string[]
}

export interface ImportOptions {
  empresa_id: number
  ano: number
  mes: number
  substituir_mes?: boolean
}

/**
 * Entrada principal — detecta automaticamente o formato e importa.
 */
export async function importXLSX(
  buffer: ArrayBuffer,
  DB: D1Database,
  opts: ImportOptions
): Promise<ImportStats> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false })

  const stats: ImportStats = {
    costureiros_criados: 0,
    costureiros_encontrados: 0,
    operacoes_criadas: 0,
    producoes_inseridas: 0,
    avisos: [],
    erros: [],
  }

  // Se existe aba "Bonificação" ou abas numeradas → formato SENAI
  const hasBonifTab = wb.SheetNames.some((n) => /bonif/i.test(n))
  const hasNumbered = wb.SheetNames.filter((n) => /^\d{1,2}$/.test(n)).length >= 3

  if (hasBonifTab || hasNumbered) {
    await importSenaiFormat(wb, DB, opts, stats)
  } else {
    await importSimpleFormat(wb, DB, opts, stats)
  }

  return stats
}

/* =========================================================
 *  FORMATO SENAI (1 aba por costureiro, layout complexo)
 * ========================================================= */
async function importSenaiFormat(
  wb: XLSX.WorkBook,
  DB: D1Database,
  opts: ImportOptions,
  stats: ImportStats
) {
  // Se ano/mês específico → remover produção antiga para esse costureiro
  if (opts.substituir_mes) {
    const fim = new Date(Date.UTC(opts.ano, opts.mes, 0)).toISOString().slice(0, 10)
    const inicio = `${opts.ano}-${String(opts.mes).padStart(2, '0')}-01`
    await DB.prepare(
      'DELETE FROM producao WHERE empresa_id = ? AND data BETWEEN ? AND ?'
    )
      .bind(opts.empresa_id, inicio, fim)
      .run()
  }

  // Cache operações
  const opsExistentes = await DB.prepare(
    'SELECT id, nome_operacao FROM operacoes WHERE empresa_id = ?'
  ).bind(opts.empresa_id).all<any>()
  const opMap = new Map<string, number>()
  for (const o of opsExistentes.results) opMap.set(String(o.nome_operacao).trim().toLowerCase(), o.id)

  // Cache costureiros
  const costExistentes = await DB.prepare(
    'SELECT id, nome FROM costureiros WHERE empresa_id = ?'
  ).bind(opts.empresa_id).all<any>()
  const costMap = new Map<string, number>()
  for (const c of costExistentes.results) costMap.set(String(c.nome).trim().toUpperCase(), c.id)

  // Iterar pelas abas que têm colaborador
  for (const sheetName of wb.SheetNames) {
    if (/bonif/i.test(sheetName)) continue
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    // C3 → nome do colaborador; C4 → mês (opcional)
    const nomeCel = getCell(ws, 'C3')
    if (!nomeCel || typeof nomeCel !== 'string') continue
    const nome = String(nomeCel).trim().toUpperCase()
    if (!nome) continue

    // Upsert costureiro
    let costId = costMap.get(nome)
    if (!costId) {
      const r = await DB.prepare(
        'INSERT INTO costureiros (empresa_id, nome, tipo_maquina, ativo) VALUES (?, ?, ?, 1)'
      ).bind(opts.empresa_id, nome, 'reta').run()
      costId = Number(r.meta.last_row_id)
      costMap.set(nome, costId)
      stats.costureiros_criados++
    } else {
      stats.costureiros_encontrados++
    }

    // Dias da semana: linhas fixas do template SENAI
    // (SEGUNDA 9, TERÇA 14, QUARTA 19, QUINTA 24, SEXTA 29) — aproximado
    const diasSemana = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA']
    const baseDate = new Date(Date.UTC(opts.ano, opts.mes - 1, 1))
    // Primeiro dia útil do mês:
    while (baseDate.getUTCDay() === 0 || baseDate.getUTCDay() === 6) baseDate.setUTCDate(baseDate.getUTCDate() + 1)

    // Percorre linhas procurando dias da semana
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
    let diaContador = 0
    for (let r = range.s.r; r <= range.e.r; r++) {
      const aCell = getCellByRC(ws, r, 0)
      if (!aCell) continue
      const nomeDia = String(aCell).trim().toUpperCase()
      if (!diasSemana.includes(nomeDia)) continue

      // Data aproximada: pegamos o dia útil correspondente
      const data = proximoDiaUtil(new Date(Date.UTC(opts.ano, opts.mes - 1, 1)), diaContador)
      diaContador++
      if (data.getUTCMonth() !== opts.mes - 1) continue

      // Coletar produção: colunas C a P contêm dados de produção (até 14 operações)
      // linha r = dia. linha r-3 = REF/Operação, r-2 = Quant, r-1 = Tempo, r = Prod/minuto
      // Formato do template: ref/operação na linha do "Dia/mês" (r-3)
      // Para pegar operação/qtd/tempo de cada coluna:
      const linhaOperacao = r - 3
      const linhaQtd = r - 2
      const linhaTempo = r - 1

      // Total pçs e minutos trabalhados ficam nas colunas S e T (indices 18, 19)
      const totalPcs = Number(getCellByRC(ws, r, 18)) || 0
      const minTrab = Number(getCellByRC(ws, r, 19)) || 0
      // Eficiência na coluna U (20) já calculada

      if (totalPcs <= 0 && minTrab <= 0) continue

      // Vamos criar um registro agregado para o dia ou múltiplos por operação
      // Tentar quebrar por coluna (C até R = colunas 2-17, 16 operações)
      let inseridoNoDia = false
      for (let col = 2; col <= 17; col++) {
        const operNome = getCellByRC(ws, linhaOperacao, col)
        const qtd = Number(getCellByRC(ws, linhaQtd, col)) || 0
        const tempoPadrao = Number(getCellByRC(ws, linhaTempo, col)) || 0
        if (!operNome || qtd <= 0 || tempoPadrao <= 0) continue
        const nomeOp = String(operNome).trim()
        if (!nomeOp || nomeOp === '0') continue

        // Upsert operação
        const keyOp = nomeOp.toLowerCase()
        let opId = opMap.get(keyOp)
        if (!opId) {
          const rr = await DB.prepare(
            'INSERT INTO operacoes (empresa_id, nome_operacao, grau_dificuldade, tempo_padrao_min) VALUES (?, ?, 1.0, ?)'
          ).bind(opts.empresa_id, nomeOp, tempoPadrao).run()
          opId = Number(rr.meta.last_row_id)
          opMap.set(keyOp, opId)
          stats.operacoes_criadas++
        }

        // Distribuir min trabalhados proporcionalmente pelo tempo padrão × qtd
        const pesoTotal = totalPcs > 0 ? (qtd * tempoPadrao) / Math.max(1, (totalPcs * tempoPadrao)) : 1
        // Se não conseguimos decompor, só dá fração igual
        const minTrabProp = minTrab > 0 ? minTrab * pesoTotal : (qtd * tempoPadrao)

        await DB.prepare(
          `INSERT INTO producao (empresa_id, data, costureiro_id, operacao_id, operacao,
           tempo_padrao_min, quantidade_produzida, minutos_trabalhados, retrabalho)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
        )
          .bind(
            opts.empresa_id, data.toISOString().slice(0, 10), costId, opId, nomeOp,
            tempoPadrao, qtd, minTrabProp
          )
          .run()
        stats.producoes_inseridas++
        inseridoNoDia = true
      }

      // Fallback: se não houve decomposição, inserir como 1 registro agregado
      if (!inseridoNoDia && totalPcs > 0 && minTrab > 0) {
        await DB.prepare(
          `INSERT INTO producao (empresa_id, data, costureiro_id, operacao,
           tempo_padrao_min, quantidade_produzida, minutos_trabalhados, retrabalho)
           VALUES (?, ?, ?, 'Produção agregada', 0, ?, ?, 0)`
        )
          .bind(opts.empresa_id, data.toISOString().slice(0, 10), costId, totalPcs, minTrab)
          .run()
        stats.producoes_inseridas++
      }
    }
  }

  if (stats.producoes_inseridas === 0) {
    stats.avisos.push('Nenhuma produção foi extraída. Verifique se o formato da planilha corresponde ao layout SENAI.')
  }
}

function proximoDiaUtil(base: Date, offset: number): Date {
  const d = new Date(base)
  let count = 0
  while (count <= offset) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      if (count === offset) return d
      count++
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d
}

function getCell(ws: XLSX.WorkSheet, ref: string): any {
  const c = ws[ref]
  return c ? c.v : undefined
}
function getCellByRC(ws: XLSX.WorkSheet, r: number, c: number): any {
  const ref = XLSX.utils.encode_cell({ r, c })
  return ws[ref]?.v
}

/* =========================================================
 *  FORMATO SIMPLES (1 aba — cabeçalhos explícitos)
 * ========================================================= */
async function importSimpleFormat(
  wb: XLSX.WorkBook,
  DB: D1Database,
  opts: ImportOptions,
  stats: ImportStats
) {
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) { stats.erros.push('Planilha vazia'); return }

  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null, raw: false })
  if (rows.length === 0) { stats.avisos.push('Nenhuma linha encontrada na primeira aba'); return }

  // Mapeamento flexível de cabeçalhos
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[áàâã]/g, 'a').replace(/[éê]/g, 'e').replace(/[íï]/g, 'i').replace(/[óôõ]/g, 'o').replace(/[úü]/g, 'u').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '')

  const costExistentes = await DB.prepare(
    'SELECT id, nome FROM costureiros WHERE empresa_id = ?'
  ).bind(opts.empresa_id).all<any>()
  const costMap = new Map<string, number>()
  for (const c of costExistentes.results) costMap.set(String(c.nome).trim().toUpperCase(), c.id)

  const opsExistentes = await DB.prepare(
    'SELECT id, nome_operacao FROM operacoes WHERE empresa_id = ?'
  ).bind(opts.empresa_id).all<any>()
  const opMap = new Map<string, number>()
  for (const o of opsExistentes.results) opMap.set(String(o.nome_operacao).trim().toLowerCase(), o.id)

  for (const row of rows) {
    // normalizar chaves
    const n: any = {}
    for (const k in row) n[norm(k)] = row[k]

    const costNome = (n.costureiro || n.nome || n.colaborador || '').toString().trim().toUpperCase()
    if (!costNome) continue

    const dataRaw = n.data || n.dia || n.date
    if (!dataRaw) continue
    const data = parseData(dataRaw)
    if (!data) { stats.avisos.push(`Data inválida ignorada: ${dataRaw}`); continue }

    // Upsert costureiro
    let costId = costMap.get(costNome)
    if (!costId) {
      const r = await DB.prepare(
        'INSERT INTO costureiros (empresa_id, nome, tipo_maquina, ativo) VALUES (?, ?, ?, 1)'
      ).bind(opts.empresa_id, costNome, String(n.maquina || n.tipomaquina || 'reta')).run()
      costId = Number(r.meta.last_row_id)
      costMap.set(costNome, costId)
      stats.costureiros_criados++
    }

    const operNome = (n.operacao || n.operation || '').toString().trim()
    let opId: number | undefined
    if (operNome) {
      const keyOp = operNome.toLowerCase()
      opId = opMap.get(keyOp)
      if (!opId) {
        const r = await DB.prepare(
          'INSERT INTO operacoes (empresa_id, nome_operacao, grau_dificuldade, tempo_padrao_min) VALUES (?, ?, ?, ?)'
        ).bind(
          opts.empresa_id, operNome,
          Number(n.graudificuldade || n.dificuldade || 1.0),
          Number(n.tempopadraomin || n.tempopadrao || n.tempo || 0)
        ).run()
        opId = Number(r.meta.last_row_id)
        opMap.set(keyOp, opId)
        stats.operacoes_criadas++
      }
    }

    await DB.prepare(
      `INSERT INTO producao (empresa_id, data, costureiro_id, operacao_id, operacao, referencia_peca,
       tempo_padrao_min, quantidade_produzida, minutos_trabalhados, retrabalho)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        opts.empresa_id, data, costId, opId || null, operNome || null,
        String(n.referencia || n.referenciapeca || n.ref || '').trim() || null,
        Number(n.tempopadraomin || n.tempopadrao || n.tempo || 0),
        Number(n.quantidadeproduzida || n.quantidade || n.qtd || 0),
        Number(n.minutostrabalhados || n.minutos || n.mintrab || 0),
        Number(n.retrabalho || 0)
      )
      .run()
    stats.producoes_inseridas++
  }
}

function parseData(raw: any): string | null {
  if (!raw) return null
  if (typeof raw === 'number') {
    // Excel serial number → date
    const ms = (raw - 25569) * 86400 * 1000
    const d = new Date(ms)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  const s = String(raw).trim()
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (m) {
    const [_, d, mo, y] = m
    const yy = y.length === 2 ? `20${y}` : y
    return `${yy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}
