import './style.css'
import { supabase, supabaseEnabled } from './supabase.js'
import { defaultTasks } from './defaultTasks.js'

const STORAGE_KEY = 'kanban-med-board-v1'
const BASE_URL = import.meta.env.BASE_URL || '/'
const columns = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' }
]

let tasks = loadLocalTasks()
let currentUser = null
let editingId = null

function normalizePath(pathname) {
  let path = pathname || '/'
  if (BASE_URL !== '/' && path.startsWith(BASE_URL)) {
    path = path.slice(BASE_URL.length)
  }
  return `/${path.replace(/^\/+/, '')}`
}

async function handleAuthCallback() {
  if (!supabaseEnabled || !supabase) return false

  const path = normalizePath(window.location.pathname)
  if (path !== '/auth/callback') return false

  const params = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.slice(1))
  const code = params.get('code') || hashParams.get('code')
  const tokenHash = params.get('token_hash') || hashParams.get('token_hash')
  const type = params.get('type') || hashParams.get('type') || 'email'

  const statusEl = document.getElementById('cloudStatus')
  const showStatus = (text) => {
    if (statusEl) statusEl.textContent = text
  }

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
    } else if (tokenHash) {
      const email = params.get('email') || hashParams.get('email')
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type, email })
      if (error) throw error
    } else {
      showStatus('登录回调缺少 code 或 token_hash，请重新发送登录邮件。')
      return true
    }

    const { data } = await supabase.auth.getSession()
    currentUser = data.session?.user || null
    const home = `${BASE_URL.replace(/\/$/, '')}/`
    window.history.replaceState({}, '', home)
    showStatus(currentUser ? `云端已连接：当前账号 ${currentUser.email || currentUser.id}` : '登录完成。')
    render()
    return true
  } catch (error) {
    showStatus(`登录回调失败：${error.message}`)
    console.warn('Supabase 登录回调失败', error.message)
    return true
  }
}

function loadLocalTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('本地记录读取失败', e)
  }
  return structuredClone(defaultTasks)
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

function normalizeTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    category: row.category,
    due_date: row.due_date || '',
    due_time: row.due_time || '',
    tags: row.tags || [],
    sort_order: row.sort_order || 0,
    completed_at: row.completed_at || null
  }
}

async function syncTasks() {
  if (!supabaseEnabled || !supabase || !currentUser) {
    render()
    return
  }
  const { data, error } = await supabase
    .from('kanban_tasks')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.warn('Supabase 读取失败，继续使用本地数据', error.message)
    document.getElementById('cloudStatus').textContent = '云端读取失败，当前使用本地缓存。'
    render()
    return
  }

  tasks = data && data.length ? data.map(normalizeTask) : structuredClone(defaultTasks)
  persistLocal()
  render()
}

async function saveTaskToCloud(task) {
  if (!supabaseEnabled || !supabase || !currentUser) return
  const payload = {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    due_date: task.due_date || null,
    due_time: task.due_time || null,
    tags: task.tags,
    sort_order: task.sort_order || 0,
    completed_at: task.status === 'done' ? new Date().toISOString() : null
  }

  if (task.id && !task.id.startsWith('local-')) {
    const { error } = await supabase.from('kanban_tasks').update(payload).eq('id', task.id)
    if (error) console.warn('更新云端任务失败', error.message)
  } else {
    const { data, error } = await supabase.from('kanban_tasks').insert(payload).select('id').single()
    if (!error && data) task.id = data.id
  }
}

async function deleteTaskFromCloud(task) {
  if (!supabaseEnabled || !supabase || !currentUser) return
  if (task.id && !task.id.startsWith('local-')) {
    const { error } = await supabase.from('kanban_tasks').delete().eq('id', task.id)
    if (error) console.warn('删除云端任务失败', error.message)
  }
}

function renderStats() {
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  const doing = tasks.filter(t => t.status === 'doing').length
  const today = new Date().toISOString().slice(0, 10)
  const todayTasks = tasks.filter(t => !t.due_date || t.due_date === today)
  const overdue = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done')
  const rate = total ? Math.round(done / total * 100) : 0

  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><b>${total}</b><span>总事项</span></div>
    <div class="stat-card"><b>${doing}</b><span>进行中</span></div>
    <div class="stat-card"><b>${done}</b><span>已完成</span></div>
    <div class="stat-card"><b>${overdue.length}</b><span>逾期</span></div>
    <div class="stat-card"><b>${rate}%</b><span>完成率</span></div>
  `

  document.getElementById('todayList').innerHTML = todayTasks
    .filter(t => t.status !== 'done')
    .map(t => `<li>${t.due_time ? `<span class="time">${t.due_time}</span>` : ''} ${escapeHtml(t.title)}</li>`)
    .join('') || '<li>今天没有待处理事项</li>'

  const status = document.getElementById('cloudStatus')
  if (!supabaseEnabled) status.textContent = '本地模式：未配置 Supabase，记录保存在当前浏览器。'
  else if (!currentUser) status.textContent = '未登录：当前使用本地缓存；登录后可云端同步。'
  else status.textContent = `云端已连接：当前账号 ${currentUser.email || currentUser.id}`
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]))
}

function taskCard(task) {
  const priorityMap = { low: '低', normal: '普通', high: '高', urgent: '紧急' }
  const categoryMap = { medication: '服药', work: '工作', personal: '个人', other: '其他' }
  return `
    <article class="card" draggable="true" data-id="${task.id}">
      <div class="card-top">
        <span class="badge ${task.category}">${categoryMap[task.category]}</span>
        <span class="priority ${task.priority}">${priorityMap[task.priority]}</span>
      </div>
      <h4>${escapeHtml(task.title)}</h4>
      <p>${escapeHtml(task.description)}</p>
      <div class="tags">${task.tags.map(tag => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>
      <div class="card-actions">
        <button data-action="edit">编辑</button>
        <button data-action="move" data-status="todo">待办</button>
        <button data-action="move" data-status="doing">进行中</button>
        <button data-action="move" data-status="done">完成</button>
        <button data-action="delete" class="danger">删除</button>
      </div>
    </article>
  `
}

function renderBoard() {
  const board = document.getElementById('board')
  board.innerHTML = columns.map(col => {
    const list = tasks.filter(t => t.status === col.key)
    return `
      <section class="column" data-status="${col.key}">
        <h3>${col.label} <span>${list.length}</span></h3>
        <div class="dropzone">${list.map(taskCard).join('')}</div>
      </section>
    `
  }).join('')

  board.querySelectorAll('[data-action="move"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card')
      const task = tasks.find(t => t.id === card.dataset.id)
      task.status = btn.dataset.status
      persistLocal()
      saveTaskToCloud(task)
      render()
    })
  })

  board.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card')
      const task = tasks.find(t => t.id === card.dataset.id)
      openTaskDialog(task)
    })
  })

  board.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.card')
      const task = tasks.find(t => t.id === card.dataset.id)
      if (!confirm(`确定删除“${task.title}”吗？`)) return
      await deleteTaskFromCloud(task)
      tasks = tasks.filter(t => t.id !== task.id)
      persistLocal()
      render()
    })
  })

  bindDragDrop()
}

function bindDragDrop() {
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id)
    })
  })
  document.querySelectorAll('.dropzone').forEach(zone => {
    zone.addEventListener('dragover', e => e.preventDefault())
    zone.addEventListener('drop', e => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain')
      const status = zone.closest('.column').dataset.status
      const task = tasks.find(t => t.id === id)
      if (!task) return
      task.status = status
      persistLocal()
      saveTaskToCloud(task)
      render()
    })
  })
}

function openTaskDialog(task = null) {
  editingId = task?.id || null
  const form = document.getElementById('taskForm')
  document.getElementById('dialogTitle').textContent = task ? '编辑事项' : '新增事项'
  form.title.value = task?.title || ''
  form.description.value = task?.description || ''
  form.status.value = task?.status || 'todo'
  form.priority.value = task?.priority || 'normal'
  form.category.value = task?.category || 'work'
  form.due_date.value = task?.due_date || ''
  form.due_time.value = task?.due_time || ''
  form.tags.value = task?.tags?.join(', ') || ''
  document.getElementById('taskDialog').showModal()
}

function handleFormSubmit(event) {
  event.preventDefault()
  const form = event.target
  const tags = form.tags.value.split(',').map(tag => tag.trim()).filter(Boolean)
  const payload = {
    title: form.title.value.trim(),
    description: form.description.value.trim(),
    status: form.status.value,
    priority: form.priority.value,
    category: form.category.value,
    due_date: form.due_date.value,
    due_time: form.due_time.value,
    tags,
    sort_order: tasks.length
  }

  let task = tasks.find(t => t.id === editingId)
  if (task) {
    Object.assign(task, payload)
  } else {
    task = { id: `local-${Date.now()}`, ...payload }
    tasks.unshift(task)
  }

  persistLocal()
  saveTaskToCloud(task)
  document.getElementById('taskDialog').close()
  render()
}

async function handleAuth() {
  if (!supabaseEnabled || !supabase) {
    alert('未配置 Supabase 环境变量，当前只能使用本地模式。')
    return
  }
  if (currentUser) {
    await supabase.auth.signOut()
    currentUser = null
    tasks = structuredClone(defaultTasks)
    persistLocal()
    render()
    return
  }
  const email = prompt('请输入登录邮箱')
  if (!email) return
  const callbackUrl = new URL(`${BASE_URL}auth/callback`, window.location.origin).toString()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl }
  })
  if (error) {
    alert(`登录失败：${error.message}`)
    return
  }
  alert('登录邮件已发送，请查收邮箱中的链接完成登录，然后刷新页面。')
}

function render() {
  renderStats()
  renderBoard()
}

document.getElementById('addTask').addEventListener('click', () => openTaskDialog())
document.getElementById('cancelDialog').addEventListener('click', () => document.getElementById('taskDialog').close())
document.getElementById('taskForm').addEventListener('submit', handleFormSubmit)
document.getElementById('authButton').addEventListener('click', handleAuth)

async function initAuth() {
  if (await handleAuthCallback()) return

  if (!supabaseEnabled || !supabase) {
    render()
    return
  }
  const { data } = await supabase.auth.getSession()
  currentUser = data.session?.user || null
  document.getElementById('authButton').textContent = currentUser ? '退出登录' : '登录'
  await syncTasks()

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null
    document.getElementById('authButton').textContent = currentUser ? '退出登录' : '登录'
    syncTasks()
  })
}

initAuth()
