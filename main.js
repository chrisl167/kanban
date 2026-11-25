import './style.css'
import { supabase, supabaseEnabled } from './supabase.js'
import { defaultTasks } from './defaultTasks.js'

const STORAGE_KEY = 'kanban-med-board-v1'
const columns = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' }
]

let tasks = loadLocalTasks()

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

async function syncTasks() {
  if (!supabaseEnabled || !supabase) return
  const { data, error } = await supabase.from('kanban_tasks').select('*').order('sort_order', { ascending: true })
  if (error) {
    console.warn('Supabase 读取失败，继续使用本地数据', error.message)
    return
  }
  if (data && data.length) {
    tasks = data.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      status: row.status,
      priority: row.priority,
      category: row.category,
      due_date: row.due_date,
      due_time: row.due_time,
      tags: row.tags || [],
      sort_order: row.sort_order
    }))
    persistLocal()
    render()
  }
}

async function upsertTask(task) {
  if (!supabaseEnabled || !supabase) return
  const payload = {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    category: task.category,
    due_date: task.due_date || null,
    due_time: task.due_time || null,
    tags: task.tags,
    sort_order: task.sort_order || 0
  }
  if (task.id && task.id.startsWith('remote-')) {
    await supabase.from('kanban_tasks').update(payload).eq('id', task.id)
  } else {
    const { data } = await supabase.from('kanban_tasks').insert(payload).select('id').single()
    if (data) task.id = data.id
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
    .map(t => `<li>${t.due_time ? `<span class="time">${t.due_time}</span>` : ''} ${t.title}</li>`)
    .join('') || '<li>今天没有待处理事项</li>'
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
      <h4>${task.title}</h4>
      <p>${task.description || ''}</p>
      <div class="tags">${task.tags.map(tag => `<span>#${tag}</span>`).join('')}</div>
      <div class="card-actions">
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
      upsertTask(task)
      render()
    })
  })

  board.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card')
      const task = tasks.find(t => t.id === card.dataset.id)
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
      upsertTask(task)
      render()
    })
  })
}

function render() {
  renderStats()
  renderBoard()
}

document.getElementById('addTask').addEventListener('click', () => {
  const title = prompt('事项名称')
  if (!title) return
  const task = {
    id: `local-${Date.now()}`,
    title,
    description: '',
    status: 'todo',
    priority: 'normal',
    category: 'work',
    due_date: '',
    due_time: '',
    tags: ['新增'],
    sort_order: tasks.length
  }
  tasks.unshift(task)
  persistLocal()
  upsertTask(task)
  render()
})

render()
syncTasks()
