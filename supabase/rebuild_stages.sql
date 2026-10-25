-- ProjectHub stage-based architecture
-- Safe upgrade: preserves existing projects/tasks. Existing tasks are grouped into a
-- default "General stage" per project so their dates, descriptions and statuses survive.
-- Run once in Supabase SQL Editor as the database owner.

create extension if not exists pgcrypto;

create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text check (description is null or char_length(description) <= 5000),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists project_stages_project_created_idx
  on public.project_stages(project_id, created_at);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 5000),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  start_date date,
  due_date date,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_dates_valid check (start_date is null or due_date is null or due_date >= start_date)
);

alter table public.project_tasks
  add column if not exists stage_id uuid references public.project_stages(id) on delete cascade;

-- Preserve pre-existing tasks by placing them into one General stage per project.
insert into public.project_stages(project_id, name, description, created_by)
select p.id, 'General stage', 'Existing tasks moved here by the stage architecture upgrade.', p.created_by
from public.projects p
where exists (
  select 1 from public.project_tasks t
  where t.project_id = p.id and t.stage_id is null
)
and not exists (
  select 1 from public.project_stages s
  where s.project_id = p.id and s.name = 'General stage'
);

update public.project_tasks t
set stage_id = s.id
from public.project_stages s
where s.project_id = t.project_id
  and s.name = 'General stage'
  and t.stage_id is null;

-- Existing task rows are not deleted. Enforce the stage relationship only after backfill.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_tasks_stage_id_not_null_check'
      and conrelid = 'public.project_tasks'::regclass
  ) then
    alter table public.project_tasks
      add constraint project_tasks_stage_id_not_null_check check (stage_id is not null) not valid;
  end if;
end $$;

-- Stage-level and task-level comments, separate from the existing project discussion.
create table if not exists public.stage_comments (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_tasks_project_stage_idx on public.project_tasks(project_id, stage_id);
create index if not exists project_tasks_due_idx on public.project_tasks(project_id, due_date);
create index if not exists stage_comments_stage_created_idx on public.stage_comments(stage_id, created_at);
create index if not exists task_comments_task_created_idx on public.task_comments(task_id, created_at);

alter table public.project_stages enable row level security;
alter table public.project_tasks enable row level security;
alter table public.stage_comments enable row level security;
alter table public.task_comments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_stages' and policyname='Members can view project stages') then
    create policy "Members can view project stages" on public.project_stages
      for select to authenticated using (public.current_project_role(project_id) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_stages' and policyname='Editors can create project stages') then
    create policy "Editors can create project stages" on public.project_stages
      for insert to authenticated with check (created_by = (select auth.uid()) and public.current_project_role(project_id) in ('owner','editor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_stages' and policyname='Editors can update project stages') then
    create policy "Editors can update project stages" on public.project_stages
      for update to authenticated using (public.current_project_role(project_id) in ('owner','editor'))
      with check (public.current_project_role(project_id) in ('owner','editor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_stages' and policyname='Editors can delete project stages') then
    create policy "Editors can delete project stages" on public.project_stages
      for delete to authenticated using (public.current_project_role(project_id) in ('owner','editor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_tasks' and policyname='Members can view project tasks') then
    create policy "Members can view project tasks" on public.project_tasks
      for select to authenticated using (public.current_project_role(project_id) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_tasks' and policyname='Editors can create project tasks') then
    create policy "Editors can create project tasks" on public.project_tasks
      for insert to authenticated with check (created_by = (select auth.uid()) and public.current_project_role(project_id) in ('owner','editor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_tasks' and policyname='Editors can update project tasks') then
    create policy "Editors can update project tasks" on public.project_tasks
      for update to authenticated using (public.current_project_role(project_id) in ('owner','editor'))
      with check (public.current_project_role(project_id) in ('owner','editor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_tasks' and policyname='Editors can delete project tasks') then
    create policy "Editors can delete project tasks" on public.project_tasks
      for delete to authenticated using (public.current_project_role(project_id) in ('owner','editor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stage_comments' and policyname='Members can view stage comments') then
    create policy "Members can view stage comments" on public.stage_comments for select to authenticated
      using (exists (select 1 from public.project_stages s where s.id=stage_id and public.current_project_role(s.project_id) is not null));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stage_comments' and policyname='Members can comment on stages') then
    create policy "Members can comment on stages" on public.stage_comments for insert to authenticated
      with check (user_id=(select auth.uid()) and exists (select 1 from public.project_stages s where s.id=stage_id and public.current_project_role(s.project_id) in ('owner','editor','commenter')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stage_comments' and policyname='Authors and editors manage stage comments') then
    create policy "Authors and editors manage stage comments" on public.stage_comments for update to authenticated
      using (user_id=(select auth.uid()) or exists (select 1 from public.project_stages s where s.id=stage_id and public.current_project_role(s.project_id) in ('owner','editor')))
      with check (user_id=(select auth.uid()) or exists (select 1 from public.project_stages s where s.id=stage_id and public.current_project_role(s.project_id) in ('owner','editor')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stage_comments' and policyname='Authors and editors delete stage comments') then
    create policy "Authors and editors delete stage comments" on public.stage_comments for delete to authenticated
      using (user_id=(select auth.uid()) or exists (select 1 from public.project_stages s where s.id=stage_id and public.current_project_role(s.project_id) in ('owner','editor')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_comments' and policyname='Members can view task comments') then
    create policy "Members can view task comments" on public.task_comments for select to authenticated
      using (exists (select 1 from public.project_tasks t where t.id=task_id and public.current_project_role(t.project_id) is not null));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_comments' and policyname='Members can comment on tasks') then
    create policy "Members can comment on tasks" on public.task_comments for insert to authenticated
      with check (user_id=(select auth.uid()) and exists (select 1 from public.project_tasks t where t.id=task_id and public.current_project_role(t.project_id) in ('owner','editor','commenter')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_comments' and policyname='Authors and editors manage task comments') then
    create policy "Authors and editors manage task comments" on public.task_comments for update to authenticated
      using (user_id=(select auth.uid()) or exists (select 1 from public.project_tasks t where t.id=task_id and public.current_project_role(t.project_id) in ('owner','editor')))
      with check (user_id=(select auth.uid()) or exists (select 1 from public.project_tasks t where t.id=task_id and public.current_project_role(t.project_id) in ('owner','editor')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_comments' and policyname='Authors and editors delete task comments') then
    create policy "Authors and editors delete task comments" on public.task_comments for delete to authenticated
      using (user_id=(select auth.uid()) or exists (select 1 from public.project_tasks t where t.id=task_id and public.current_project_role(t.project_id) in ('owner','editor')));
  end if;
end $$;

grant select, insert, update, delete on public.project_stages to authenticated;
grant select, insert, update, delete on public.project_tasks to authenticated;
grant select, insert, update, delete on public.stage_comments to authenticated;
grant select, insert, update, delete on public.task_comments to authenticated;

-- The UI deliberately asks for two confirmations before deleting a stage with tasks.
-- Foreign-key cascades then remove that stage's tasks and their task comments.
