-- ProjectHub starter schema for Supabase.
-- Run in Supabase SQL Editor as a project administrator.
-- RLS policies are the actual security boundary; never rely on UI-only role checks.

create extension if not exists pgcrypto;

create type public.project_role as enum ('owner', 'editor', 'commenter', 'viewer');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.project_role not null default 'viewer',
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index project_members_user_idx on public.project_members(user_id);
create index project_comments_project_created_idx on public.project_comments(project_id, created_at);

create or replace function public.current_project_role(target_project uuid)
returns public.project_role
language sql
stable
security definer
set search_path = ''
as $$
  select pm.role
  from public.project_members pm
  where pm.project_id = target_project
    and pm.user_id = (select auth.uid())
  limit 1
$$;

revoke all on function public.current_project_role(uuid) from public;
grant execute on function public.current_project_role(uuid) to authenticated;

-- Atomic project creation: create the project and its owner membership together.
create or replace function public.create_project(project_name text, project_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_project_id uuid;
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'You must be signed in';
  end if;
  if project_name is null or char_length(trim(project_name)) < 1 or char_length(trim(project_name)) > 80 then
    raise exception 'Project name must be between 1 and 80 characters';
  end if;
  insert into public.projects(name, description, created_by)
  values (trim(project_name), nullif(trim(project_description), ''), actor)
  returning id into new_project_id;
  insert into public.project_members(project_id, user_id, role)
  values (new_project_id, actor, 'owner');
  return new_project_id;
end;
$$;
revoke all on function public.create_project(text, text) from public;
grant execute on function public.create_project(text, text) to authenticated;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_comments enable row level security;

-- Project access is based on membership.
create policy "Members can view projects"
on public.projects for select to authenticated
using (exists (
  select 1 from public.project_members pm
  where pm.project_id = projects.id and pm.user_id = (select auth.uid())
));

create policy "Owners and editors can update projects"
on public.projects for update to authenticated
using (public.current_project_role(id) in ('owner', 'editor'))
with check (public.current_project_role(id) in ('owner', 'editor'));

create policy "Owners can delete projects"
on public.projects for delete to authenticated
using (public.current_project_role(id) = 'owner');

-- Members can view only the roster of projects they belong to.
create policy "Members can view project roster"
on public.project_members for select to authenticated
using (public.current_project_role(project_id) is not null);

-- A main editor/owner may assign roles to other members, but cannot demote
-- themselves or create another owner via this starter policy. Invitations need
-- a server-side flow before a new user can be added safely.
create policy "Owners manage member roles"
on public.project_members for update to authenticated
using (public.current_project_role(project_id) = 'owner' and user_id <> (select auth.uid()))
with check (public.current_project_role(project_id) = 'owner' and user_id <> (select auth.uid()) and role <> 'owner');

create policy "Owners remove other members"
on public.project_members for delete to authenticated
using (public.current_project_role(project_id) = 'owner' and user_id <> (select auth.uid()));

-- Only server-side project creation function creates membership rows.
-- No direct insert policy is intentionally provided.

create policy "Members can read project comments"
on public.project_comments for select to authenticated
using (public.current_project_role(project_id) is not null);

create policy "Editors and commenters can add comments"
on public.project_comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.current_project_role(project_id) in ('owner', 'editor', 'commenter')
);

create policy "Authors or owners can delete comments"
on public.project_comments for delete to authenticated
using (
  user_id = (select auth.uid())
  or public.current_project_role(project_id) = 'owner'
);

grant select, update, delete on public.projects to authenticated;
grant select, update, delete on public.project_members to authenticated;
grant select, insert, delete on public.project_comments to authenticated;

-- NOTE: Invite by email is intentionally not implemented from browser code.
-- Implement it with a Supabase Edge Function using a server-only service-role key,
-- validating the caller's owner role, then inviting/adding the target user safely.
