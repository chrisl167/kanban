import './style.css'
import { api, clearSession, getStoredUser, saveSession } from './api.js'
import { defaultTasks } from './defaultTasks.js'

const STORAGE_KEY = 'kanban-med-board-v1'
const DEFAULT_TITLE = '服药与工作看板'
const columns = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' }
]

let tasks = loadLocalTasks()
let currentUser = getStoredUser()
let editingId = null
let pendingEmail = ''
let allowRegistration = true
let forcedPasswordChange = false
let systemThemeMedia = null
let systemThemeWatcher = null

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
  if (!currentUser) {
    render()
    return
  }

  try {
    const remoteTasks = await api.listTasks()
    tasks = remoteTasks.length ? remoteTasks.map(normalizeTask) : structuredClone(defaultTasks)
    persistLocal()
    setCloudStatus('服务器已连接', `当前账号 ${currentUser.display_name || currentUser.email}`, 'online')
  } catch (error) {
    console.warn('服务器读取失败，继续使用本地数据', error.message)
    setCloudStatus('服务器读取失败', '当前使用本地缓存。', 'local')
  }
  render()
}

async function saveTaskToServer(task) {
  if (!currentUser) return

  const payload = {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    due_date: task.due_date || '',
    due_time: task.due_time || '',
    tags: task.tags,
    sort_order: task.sort_order || 0
  }

  try {
    if (task.id && !task.id.startsWith('local-')) {
      const updated = await api.updateTask(task.id, payload)
      Object.assign(task, normalizeTask(updated))
    } else {
      const created = await api.createTask(payload)
      Object.assign(task, normalizeTask(created))
    }
    persistLocal()
  } catch (error) {
    console.warn('保存任务到服务器失败', error.message)
    setCloudStatus('保存失败', '改动已保留在本地，稍后可重试。', 'local')
  }
}

async function deleteTaskFromServer(task) {
  if (!currentUser || !task.id || task.id.startsWith('local-')) return
  try {
    await api.deleteTask(task.id)
  } catch (error) {
    console.warn('删除服务器任务失败', error.message)
  }
}

function setCloudStatus(label, detail, tone = 'local') {
  const status = document.getElementById('cloudStatus')
  const statusText = document.getElementById('cloudStatusText')
  if (status) {
    status.textContent = label
    status.className = `status-pill ${tone}`
  }
  if (statusText) statusText.textContent = detail
}

async function loadAuthConfig() {
  try {
    const config = await api.getAuthConfig()
    allowRegistration = Boolean(config.allowRegistration)
  } catch {
    allowRegistration = true
  }
  const registerButton = document.getElementById('authRegister')
  if (registerButton) registerButton.style.display = allowRegistration ? '' : 'none'
}

function applyTheme(theme) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
  const resolved = theme === 'dark' || (theme === 'system' && systemDark.matches) ? 'dark' : 'light'
  document.documentElement.dataset.theme = resolved

  if (systemThemeMedia && systemThemeWatcher) {
    systemThemeMedia.removeEventListener('change', systemThemeWatcher)
  }
  systemThemeMedia = null
  systemThemeWatcher = null

  if (theme === 'system') {
    systemThemeMedia = systemDark
    systemThemeWatcher = () => applyTheme('system')
    systemDark.addEventListener('change', systemThemeWatcher)
  }
}

function applyProfile() {
  const title = currentUser?.board_title || DEFAULT_TITLE
  document.getElementById('boardTitle').textContent = title
  document.title = title

  const profileButton = document.getElementById('profileButton')
  const authButton = document.getElementById('authButton')
  profileButton.hidden = !currentUser
  authButton.textContent = currentUser ? (currentUser.display_name || currentUser.email) : '登录'

  const profileMeta = document.getElementById('profileMeta')
  if (currentUser) {
    profileMeta.innerHTML = `
      <div><span>邮箱</span><b>${escapeHtml(currentUser.email)}</b></div>
      <div><span>昵称</span><b>${escapeHtml(currentUser.display_name || '未设置')}</b></div>
    `
    const form = document.getElementById('profileForm')
    form.display_name.value = currentUser.display_name || ''
    form.board_title.value = currentUser.board_title || DEFAULT_TITLE
    form.theme.value = currentUser.theme || 'system'
  }

  applyTheme(currentUser?.theme || 'system')
}

async function refreshProfile() {
  if (!currentUser) return
  try {
    currentUser = await api.getMe()
    saveSession({ user: currentUser })
    applyProfile()
  } catch (error) {
    console.warn('读取账号资料失败', error.message)
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
    <div class="stat-card"><span class="stat-label">总事项</span><b>${total}</b></div>
    <div class="stat-card"><span class="stat-label">进行中</span><b>${doing}</b></div>
    <div class="stat-card"><span class="stat-label">已完成</span><b>${done}</b></div>
    <div class="stat-card"><span class="stat-label">逾期</span><b class="danger-text">${overdue.length}</b></div>
    <div class="stat-card stat-rate"><span class="stat-label">完成率</span><b>${rate}%</b></div>
  `
  document.getElementById('progressBar').style.width = `${rate}%`

  document.getElementById('todayList').innerHTML = todayTasks
    .filter(t => t.status !== 'done')
    .map(t => `<li>${t.due_time ? `<span class="time">${t.due_time}</span>` : ''} <span>${escapeHtml(t.title)}</span></li>`)
    .join('') || '<li>今天没有待处理事项</li>'

  if (!currentUser) setCloudStatus('未登录', '当前使用本地缓存；登录后可同步到 SQLite 服务器。', 'local')
  else setCloudStatus('服务器已连接', `当前账号 ${currentUser.display_name || currentUser.email}`, 'online')
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]))
}

function formatDue(task) {
  if (!task.due_date && !task.due_time) return ''
  const dateText = task.due_date || ''
  const timeText = task.due_time || ''
  return [dateText, timeText].filter(Boolean).join(' ')
}

function dueState(task) {
  if (task.status === 'done' || !task.due_date) return ''
  const today = new Date().toISOString().slice(0, 10)
  if (task.due_date < today) return 'overdue'
  if (task.due_date === today) return 'today'
  return ''
}

function emptyIllustration(label) {
  return `
    <div class="empty-state">
      <svg viewBox="0 0 160 110" role="img" aria-label="${escapeHtml(label)}">
        <circle cx="80" cy="56" r="38" fill="var(--surface-subtle)" />
        <rect x="48" y="34" width="64" height="44" rx="10" fill="var(--surface)" stroke="var(--line-strong)" />
        <rect x="56" y="44" width="38" height="7" rx="3.5" fill="var(--primary-soft)" />
        <rect x="56" y="58" width="26" height="7" rx="3.5" fill="var(--line)" />
        <path d="M112 42l10 10-10 10" fill="none" stroke="var(--subtle)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <p>${escapeHtml(label)}</p>
    </div>`
}

function taskCard(task) {
  const priorityMap = { low: '低', normal: '普通', high: '高', urgent: '紧急' }
  const categoryMap = { medication: '服药', work: '工作', personal: '个人', other: '其他' }
  const state = dueState(task)
  const cardClass = ['card', state, task.status === 'done' ? 'done' : ''].filter(Boolean).join(' ')
  const dueText = formatDue(task)
  const tagsHtml = task.tags?.length
    ? `<div class="tags">${task.tags.map(tag => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>`
    : ''
  return `
    <article class="${cardClass}" draggable="true" data-id="${task.id}">
      <span class="drag-handle" title="拖拽卡片">⋮⋮</span>
      <div class="card-top">
        <div class="badges">
          <span class="badge ${task.category}">${categoryMap[task.category]}</span>
          <span class="priority ${task.priority}">${priorityMap[task.priority]}</span>
        </div>
      </div>
      <h4>${escapeHtml(task.title)}</h4>
      <p>${escapeHtml(task.description)}</p>
      ${tagsHtml}
      <div class="card-meta">
        ${dueText ? `<span class="due-meta ${state}">${escapeHtml(dueText)}</span>` : '<span class="due-meta muted">未设置截止时间</span>'}
      </div>
      <div class="card-actions">
        <button type="button" data-action="edit" title="编辑事项">编辑</button>
        <button type="button" data-action="move" data-status="todo" title="移到待办">待办</button>
        <button type="button" data-action="move" data-status="doing" title="移到进行中">进行中</button>
        <button type="button" data-action="move" data-status="done" title="标记完成">完成</button>
        <button type="button" data-action="delete" class="danger" title="删除事项">删除</button>
      </div>
    </article>
  `
}

function renderBoard() {
  const board = document.getElementById('board')
  board.innerHTML = columns.map(col => {
    const list = tasks.filter(t => t.status === col.key)
    const empty = list.length ? '' : emptyIllustration(col.key === 'done' ? '已完成的事项会显示在这里' : '暂无事项，拖拽卡片到这里或新增事项')
    return `
      <section class="column" data-status="${col.key}">
        <div class="column-head">
          <h3>${col.label}</h3>
          <span class="column-count">${list.length}</span>
        </div>
        <div class="dropzone">${list.map(taskCard).join('')}${empty}</div>
      </section>
    `
  }).join('')

  board.querySelectorAll('[data-action="move"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card')
      const task = tasks.find(t => t.id === card.dataset.id)
      task.status = btn.dataset.status
      persistLocal()
      saveTaskToServer(task)
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
      await deleteTaskFromServer(task)
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
      card.classList.add('dragging')
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', card.dataset.id)
    })
    card.addEventListener('dragend', () => card.classList.remove('dragging'))
  })

  document.querySelectorAll('.dropzone').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      zone.classList.add('dragover')
    })
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
    zone.addEventListener('drop', e => {
      zone.classList.remove('dragover')
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain')
      const status = zone.closest('.column').dataset.status
      const task = tasks.find(t => t.id === id)
      if (!task) return

      const cards = [...zone.querySelectorAll('.card:not(.dragging)')]
      const afterCard = cards.find(card => e.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2)
      tasks = tasks.filter(t => t.id !== task.id)
      task.status = status

      if (afterCard) {
        const afterTask = tasks.find(t => t.id === afterCard.dataset.id)
        const index = afterTask ? tasks.indexOf(afterTask) + 1 : tasks.length
        tasks.splice(index, 0, task)
      } else {
        tasks.unshift(task)
      }

      persistLocal()
      saveTaskToServer(task)
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

async function handleFormSubmit(event) {
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
  await saveTaskToServer(task)
  document.getElementById('taskDialog').close()
  render()
}

function setAuthMessage(text, isError = false) {
  const el = document.getElementById('authMessage')
  if (!el) return
  el.textContent = text || ''
  el.classList.toggle('error', Boolean(isError))
}

function setPasswordMessage(text, isError = false) {
  const el = document.getElementById('passwordMessage')
  if (!el) return
  el.textContent = text || ''
  el.classList.toggle('error', Boolean(isError))
}

function openAuthDialog(mode = 'login') {
  const form = document.getElementById('authForm')
  form.email.value = pendingEmail || ''
  form.password.value = ''
  document.getElementById('authMode').textContent = mode === 'register' ? '注册账号' : '账号登录'
  document.getElementById('authSubmit').textContent = mode === 'register' ? '注册并登录' : '登录'
  setAuthMessage(mode === 'register' ? '首次使用请设置邮箱和至少 6 位密码。' : '输入账号密码登录，数据会同步到本地服务器。')
  form.dataset.mode = mode
  document.getElementById('authDialog').showModal()
}

function closeAuthDialog() {
  document.getElementById('authDialog').close()
  setAuthMessage('')
}

async function submitAuth(event) {
  event.preventDefault()
  const form = document.getElementById('authForm')
  const email = form.email.value.trim().toLowerCase()
  const password = form.password.value
  const mode = form.dataset.mode || 'login'

  if (!email || !password) {
    setAuthMessage('请输入邮箱和密码。', true)
    return
  }

  pendingEmail = email
  setAuthMessage(mode === 'register' ? '正在注册账号……' : '正在登录……')

  try {
    const session = mode === 'register' ? await api.register({ email, password }) : await api.login({ email, password })
    saveSession(session)
    currentUser = session.user
    closeAuthDialog()
    await syncTasks()
    if (currentUser.must_change_password) {
      forcedPasswordChange = true
      openPasswordDialog(true)
    } else {
      await refreshProfile()
    }
  } catch (error) {
    setAuthMessage(error.message || '登录失败', true)
  }
}

async function handleAuth() {
  if (currentUser) {
    try {
      await api.logout()
    } catch {
      // 即使退出请求失败，也清理浏览器本地会话
    }
    clearSession()
    currentUser = null
    pendingEmail = ''
    forcedPasswordChange = false
    tasks = structuredClone(defaultTasks)
    persistLocal()
    applyProfile()
    render()
    return
  }
  openAuthDialog('login')
}

function openPasswordDialog(forced = false) {
  forcedPasswordChange = forced
  const form = document.getElementById('passwordForm')
  form.reset()
  setPasswordMessage('')
  document.getElementById('passwordDialogTitle').textContent = forced ? '首次登录，请修改密码' : '修改密码'
  document.getElementById('passwordHint').textContent = forced
    ? '这是账号的初始密码，为保障安全，请先设置一个新的登录密码。'
    : '修改后请使用新密码登录；当前会话会自动保留。'
  document.getElementById('cancelPassword').hidden = forced
  document.getElementById('passwordDialog').showModal()
}

async function submitPassword(event) {
  event.preventDefault()
  const form = event.target
  const oldPassword = form.old_password.value
  const newPassword = form.new_password.value
  const confirmPassword = form.confirm_password.value

  if (newPassword.length < 6) {
    setPasswordMessage('新密码至少需要 6 位。', true)
    return
  }
  if (newPassword !== confirmPassword) {
    setPasswordMessage('两次输入的新密码不一致。', true)
    return
  }
  if (newPassword === oldPassword) {
    setPasswordMessage('新密码不能与当前密码相同。', true)
    return
  }

  setPasswordMessage('正在保存新密码……')
  try {
    const result = await api.changePassword({ old_password: oldPassword, new_password: newPassword })
    currentUser = result.user
    saveSession({ user: currentUser })
    document.getElementById('passwordDialog').close()
    forcedPasswordChange = false
    setPasswordMessage('')
    applyProfile()
  } catch (error) {
    setPasswordMessage(error.message || '修改密码失败', true)
  }
}

function openProfileDialog() {
  if (!currentUser) return
  applyProfile()
  document.getElementById('profileDialog').showModal()
}

async function submitProfile(event) {
  event.preventDefault()
  const form = event.target
  const body = {
    display_name: form.display_name.value.trim(),
    board_title: form.board_title.value.trim(),
    theme: form.theme.value
  }

  try {
    currentUser = await api.updateProfile(body)
    saveSession({ user: currentUser })
    applyProfile()
    render()
    document.getElementById('profileDialog').close()
  } catch (error) {
    setCloudStatus('保存失败', error.message, 'local')
  }
}

function render() {
  renderStats()
  renderBoard()
}

document.getElementById('addTask').addEventListener('click', () => openTaskDialog())
document.getElementById('cancelDialog').addEventListener('click', () => document.getElementById('taskDialog').close())
document.getElementById('taskForm').addEventListener('submit', handleFormSubmit)
document.getElementById('authButton').addEventListener('click', handleAuth)
document.getElementById('cancelAuth').addEventListener('click', closeAuthDialog)
document.getElementById('authForm').addEventListener('submit', submitAuth)
document.getElementById('authRegister').addEventListener('click', () => openAuthDialog('register'))
document.getElementById('profileButton').addEventListener('click', openProfileDialog)
document.getElementById('profileForm').addEventListener('submit', submitProfile)
document.getElementById('cancelProfile').addEventListener('click', () => document.getElementById('profileDialog').close())
document.getElementById('openPasswordFromProfile').addEventListener('click', () => {
  document.getElementById('profileDialog').close()
  openPasswordDialog(false)
})
document.getElementById('passwordForm').addEventListener('submit', submitPassword)
document.getElementById('cancelPassword').addEventListener('click', () => {
  if (!forcedPasswordChange) document.getElementById('passwordDialog').close()
})
document.getElementById('passwordDialog').addEventListener('cancel', event => {
  if (forcedPasswordChange) event.preventDefault()
})

async function initApp() {
  applyProfile()
  updateAuthButton()
  await loadAuthConfig()
  await syncTasks()
  if (currentUser?.must_change_password) {
    forcedPasswordChange = true
    openPasswordDialog(true)
  }
}

function updateAuthButton() {
  document.getElementById('authButton').textContent = currentUser ? (currentUser.display_name || currentUser.email) : '登录'
}

initApp()
