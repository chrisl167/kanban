-- 看板任务表：同时承载服药任务和通用工作事项
create table if not exists public.kanban_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  category text not null default 'work' check (category in ('medication', 'work', 'personal', 'other')),
  due_date date,
  due_time text,
  tags text[] not null default '{}',
  sort_order int not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 可选：如果接入 Supabase Auth，可加 owner_id uuid references auth.users(id)，并在策略中按 auth.uid() 过滤
alter table public.kanban_tasks enable row level security;

-- 示例策略：个人自用演示允许匿名读写。正式公开项目请改为登录后仅访问本人数据。
create policy "anon can read tasks"
  on public.kanban_tasks for select
  to anon
  using (true);

create policy "anon can insert tasks"
  on public.kanban_tasks for insert
  to anon
  with check (true);

create policy "anon can update tasks"
  on public.kanban_tasks for update
  to anon
  using (true)
  with check (true);

create policy "anon can delete tasks"
  on public.kanban_tasks for delete
  to anon
  using (true);

create index if not exists idx_kanban_tasks_status on public.kanban_tasks(status);
create index if not exists idx_kanban_tasks_due_date on public.kanban_tasks(due_date);
