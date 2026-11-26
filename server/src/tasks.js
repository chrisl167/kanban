import crypto from 'node:crypto'
import { db, normalizeTask } from './db.js'

const STATUS = new Set(['todo', 'doing', 'done'])
const PRIORITY = new Set(['low', 'normal', 'high', 'urgent'])
const CATEGORY = new Set(['medication', 'work', 'personal', 'other'])

function validateTask(body) {
  const title = String(body.title || '').trim()
  if (!title) throw Object.assign(new Error('事项名称不能为空'), { status: 400 })

  const status = STATUS.has(body.status) ? body.status : 'todo'
  const priority = PRIORITY.has(body.priority) ? body.priority : 'normal'
  const category = CATEGORY.has(body.category) ? body.category : 'other'
  const tags = Array.isArray(body.tags) ? body.tags.map(String) : []

  return {
    title,
    description: String(body.description || '').trim(),
    status,
    priority,
    category,
    due_date: body.due_date || null,
    due_time: body.due_time || null,
    tags: JSON.stringify(tags),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    completed_at: status === 'done' ? new Date().toISOString() : null
  }
}

export function listTasks(userId) {
  const rows = db.prepare(
    'SELECT * FROM tasks WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(userId)
  return rows.map(normalizeTask)
}

export function createTask(userId, body) {
  const task = validateTask(body)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO tasks (
      id, user_id, title, description, status, priority, category,
      due_date, due_time, tags, sort_order, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    task.title,
    task.description,
    task.status,
    task.priority,
    task.category,
    task.due_date,
    task.due_time,
    task.tags,
    task.sort_order,
    task.completed_at,
    now,
    now
  )

  return normalizeTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id))
}

export function updateTask(userId, taskId, body) {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, userId)
  if (!existing) throw Object.assign(new Error('任务不存在'), { status: 404 })

  const task = validateTask({ ...existing, ...body })
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, status = ?, priority = ?, category = ?,
        due_date = ?, due_time = ?, tags = ?, sort_order = ?, completed_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    task.title,
    task.description,
    task.status,
    task.priority,
    task.category,
    task.due_date,
    task.due_time,
    task.tags,
    task.sort_order,
    task.completed_at,
    now,
    taskId,
    userId
  )

  return normalizeTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId))
}

export function deleteTask(userId, taskId) {
  const result = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(taskId, userId)
  if (result.changes === 0) throw Object.assign(new Error('任务不存在'), { status: 404 })
}
