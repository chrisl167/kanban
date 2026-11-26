import './env.js'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authRequired, createToken, loginUser, registerUser } from './auth.js'
import { createTask, deleteTask, listTasks, updateTask } from './tasks.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT || 3100)
const HOST = process.env.HOST || '127.0.0.1'
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, '..', '..', 'dist')
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION === 'true'

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'kanban-server', time: new Date().toISOString() })
})

app.get('/api/auth/config', (_req, res) => {
  res.json({ allowRegistration: ALLOW_REGISTRATION })
})

app.post('/api/auth/register', (req, res) => {
  if (!ALLOW_REGISTRATION) {
    return res.status(403).json({ error: '注册已关闭；请联系管理员开通账号' })
  }

  try {
    const { email, password } = req.body || {}
    if (!email || !password || String(password).length < 6) {
      return res.status(400).json({ error: '邮箱必填，密码至少 6 位' })
    }
    const user = registerUser(email, String(password))
    const token = createToken(user)
    res.status(201).json({ token, user })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {}
    const user = loginUser(email || '', String(password || ''))
    const token = createToken(user)
    res.json({ token, user })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.post('/api/auth/logout', authRequired, (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/tasks', authRequired, (req, res) => {
  res.json(listTasks(req.user.id))
})

app.post('/api/tasks', authRequired, (req, res) => {
  try {
    const task = createTask(req.user.id, req.body || {})
    res.status(201).json(task)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.put('/api/tasks/:id', authRequired, (req, res) => {
  try {
    const task = updateTask(req.user.id, req.params.id, req.body || {})
    res.json(task)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

app.delete('/api/tasks/:id', authRequired, (req, res) => {
  try {
    deleteTask(req.user.id, req.params.id)
    res.json({ ok: true })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: 'index.html' }))
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

const indexFile = path.join(DIST_DIR, 'index.html')
if (fs.existsSync(indexFile)) {
  app.get('*', (_req, res) => {
    res.sendFile(indexFile)
  })
}

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: '服务器内部错误' })
})

app.listen(PORT, HOST, () => {
  console.log(`Kanban server listening on http://${HOST}:${PORT}`)
  console.log(`Static directory: ${DIST_DIR}`)
  console.log(`Allow registration: ${ALLOW_REGISTRATION}`)
})
