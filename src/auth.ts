/**
 * Módulo de autenticação JWT + hash PBKDF2 compatível com Cloudflare Workers.
 * Usa somente Web Crypto API (sem dependências Node).
 */

import { sign, verify } from 'hono/jwt'

export interface JwtPayload {
  sub: number          // user id
  email: string
  nome: string
  empresa_id: number
  role: 'admin' | 'gestor' | 'operador' | 'viewer'
  jti: string
  exp: number
  iat: number
}

const DEFAULT_JWT_SECRET =
  'confecsystem-dev-secret-change-in-production-please-use-wrangler-secret-put-JWT_SECRET'

export function getJwtSecret(env: any): string {
  return env?.JWT_SECRET || DEFAULT_JWT_SECRET
}

/* -------------------------------------------------------------------------
 *  Hash PBKDF2 (Web Crypto API)
 * ------------------------------------------------------------------------- */

const ITER = 100_000
const KEYLEN = 32 // bytes

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    keyMaterial,
    KEYLEN * 8
  )
  return `pbkdf2$${ITER}$${bufToB64(salt.buffer)}$${bufToB64(bits)}`
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const [algo, iterStr, saltB64, hashB64] = hash.split('$')
    if (algo !== 'pbkdf2') return false
    const iter = parseInt(iterStr, 10)
    const salt = new Uint8Array(b64ToBuf(saltB64))
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      keyMaterial,
      KEYLEN * 8
    )
    const newHash = bufToB64(bits)
    // comparação em tempo constante
    if (newHash.length !== hashB64.length) return false
    let diff = 0
    for (let i = 0; i < newHash.length; i++) diff |= newHash.charCodeAt(i) ^ hashB64.charCodeAt(i)
    return diff === 0
  } catch (e) {
    return false
  }
}

/* -------------------------------------------------------------------------
 *  JWT helpers (via hono/jwt)
 * ------------------------------------------------------------------------- */

export async function createToken(payload: Omit<JwtPayload, 'exp' | 'iat' | 'jti'>, secret: string, ttlSeconds = 60 * 60 * 24 * 7): Promise<{ token: string; jti: string; exp: number }> {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + ttlSeconds
  const jti = crypto.randomUUID()
  const full: JwtPayload = { ...payload, iat, exp, jti }
  const token = await sign(full, secret, 'HS256')
  return { token, jti, exp }
}

export async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const p = (await verify(token, secret, 'HS256')) as unknown as JwtPayload
    return p
  } catch {
    return null
  }
}

export function getTokenFromRequest(c: any): string | null {
  // Authorization: Bearer xxx
  const auth = c.req.header('authorization') || c.req.header('Authorization')
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  // Cookie
  const cookie = c.req.header('cookie') || ''
  const m = cookie.match(/(?:^|;\s*)cs_token=([^;]+)/)
  if (m) return decodeURIComponent(m[1])
  return null
}
