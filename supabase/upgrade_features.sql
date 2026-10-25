-- ProjectHub feature upgrade (additive migration for the existing database)
-- Intended to be applied once to the existing ProjectHub database.
-- This version does not DROP policies, tables, or rows.
-- Run in Supabase SQL Editor while signed in as project administrator.

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

create index if not exists project_tasks_project_idx on public.project_tasks(project_id);
create index if not exists project_tasks_due_idx on public.project_tasks(project_id, due_date);
alter table public.project_tasks enable row level security;

create policy "Members can view project tasks"
on public.project_tasks for select to authenticated
using (public.current_project_role(project_id) is not null);

create policy "Editors can create project tasks"
on public.project_tasks for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.current_project_role(project_id) in ('owner','editor')
);

create policy "Editors can update project tasks"
on public.project_tasks for update to authenticated
using (public.current_project_role(project_id) in ('owner','editor'))
with check (public.current_project_role(project_id) in ('owner','editor'));

create policy "Editors can delete project tasks"
on public.project_tasks for delete to authenticated
using (public.current_project_role(project_id) in ('owner','editor'));

grant select, insert, update, delete on public.project_tasks to authenticated;

-- Add a user who has already registered in this Supabase project by email.
-- For first-time users, use a server-side Supabase Edge Function with email delivery;
-- never put the service-role key in browser code.
create or replace function public.add_project_member_by_email(
  target_project uuid,
  target_email text,
  target_role public.project_role default 'editor'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_user uuid;
  normal_email text := lower(trim(target_email));
begin
  if actor is null then raise exception 'You must be signed in'; end if;
  if public.current_project_role(target_project) <> 'owner' then
    raise exception 'Only the project owner can add members';
  end if;
  if normal_email is null or normal_email = '' then raise exception 'Enter an email address'; end if;
  if target_role not in ('editor','commenter','viewer') then
    raise exception 'Choose Editor, Commenter, or Viewer';
  end if;
  select u.id into target_user
  from auth.users u
  where lower(u.email) = normal_email
  limit 1;
  if target_user is null then
    raise exception 'No registered account found for this email. The person must sign up first; email invitations for new users are not configured yet.';
  end if;
  if target_user = actor then raise exception 'You are already the owner of this project'; end if;
  insert into public.project_members(project_id, user_id, role)
  values (target_project, target_user, target_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
  return target_user;
end;
$$;
revoke all on function public.add_project_member_by_email(uuid,text,public.project_role) from public;
grant execute on function public.add_project_member_by_email(uuid,text,public.project_role) to authenticated;

-- Restrict direct membership edits: owner-only policy remains the security boundary.
-- The existing owner policy disallows self-demotion and creating another owner.
