// Gera hashes PBKDF2 idênticos aos do auth.ts e imprime SQL de seed
// Uso: node scripts/seed-users.mjs
import { webcrypto as crypto } from 'node:crypto'

const ITER = 100_000
const KEYLEN = 32

function bufToB64(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i])
  return Buffer.from(s, 'binary').toString('base64')
}

async function hashPassword(password) {
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

const users = [
  { email: 'admin@demo.com',    senha: 'demo123', nome: 'Administrador Demo', role: 'admin' },
  { email: 'gestor@demo.com',   senha: 'demo123', nome: 'Gestor Demo',        role: 'gestor' },
  { email: 'operador@demo.com', senha: 'demo123', nome: 'Operador Demo',      role: 'operador' },
]

console.log('-- Seed de usuários demo (empresa_id = 1)')
console.log("-- Senha de todos: demo123")
for (const u of users) {
  const h = await hashPassword(u.senha)
  const sql = `INSERT OR REPLACE INTO usuarios (empresa_id, email, nome, senha_hash, role, ativo) VALUES (1, '${u.email}', '${u.nome}', '${h}', '${u.role}', 1);`
  console.log(sql)
}
