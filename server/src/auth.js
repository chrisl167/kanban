import './env.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { db } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')
const TOKEN_TTL = process.env.JWT_TTL || '7d'

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash)
}

export function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

export function registerUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase()
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)
  if (existing) throw Object.assign(new Error('邮箱已注册'), { status: 409 })

  const id = crypto.randomUUID()
  const passwordHash = hashPassword(password)
  db.prepare(
    'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)'
  ).run(id, normalizedEmail, passwordHash)

  return { id, email: normalizedEmail }
}

export function loginUser(email, password) {
  const normalizedEmail = email.trim().toLowerCase()
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail)
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw Object.assign(new Error('邮箱或密码错误'), { status: 401 })
  }
  return { id: row.id, email: row.email }
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) {
    return res.status(401).json({ error: '未登录' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = { id: payload.sub, email: payload.email }
    next()
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}
