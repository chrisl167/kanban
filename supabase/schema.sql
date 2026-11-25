-- 看板任务表：同时承载服药任务和通用工作事项
create table if not exists public.kanban_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null default auth.uid(),
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

alter table public.kanban_tasks enable row level security;

-- 登录用户只能读写自己的任务；策略使用 if not exists，便于重复执行本脚本
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kanban_tasks' and policyname = 'Users can read own tasks') then
    create policy "Users can read own tasks"
      on public.kanban_tasks for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kanban_tasks' and policyname = 'Users can insert own tasks') then
    create policy "Users can insert own tasks"
      on public.kanban_tasks for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kanban_tasks' and policyname = 'Users can update own tasks') then
    create policy "Users can update own tasks"
      on public.kanban_tasks for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'kanban_tasks' and policyname = 'Users can delete own tasks') then
    create policy "Users can delete own tasks"
      on public.kanban_tasks for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

create index if not exists idx_kanban_tasks_user_status on public.kanban_tasks(user_id, status);
create index if not exists idx_kanban_tasks_due_date on public.kanban_tasks(due_date);
