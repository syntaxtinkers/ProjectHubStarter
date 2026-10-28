-- Company workspaces: fully additive migration.
-- This does not move, rename, delete, or rewrite existing projects, stages, tasks, or memberships.
-- Existing projects remain personal unless an admin explicitly links them in company_projects.
create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  logo_url text,
  theme jsonb not null default '{"preset":"blue-night","bg":"#0b1020","panel":"#11182b","panel2":"#151e33","text":"#e9edf7","muted":"#8792ad","border":"#252f46","accent":"#9a8cff","accent2":"#7766f7"}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'employee' check (role in ('admin','employee')),
  full_name text,
  job_title text,
  joined_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists public.company_projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete restrict,
  added_at timestamptz not null default now(),
  unique (company_id, project_id)
);

create table if not exists public.company_project_assignments (
  company_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (company_id, project_id, user_id),
  foreign key (company_id, project_id) references public.company_projects(company_id, project_id) on delete cascade,
  foreign key (company_id, user_id) references public.company_members(company_id, user_id) on delete cascade
);

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null default 'employee' check (role in ('admin','employee')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  unique (company_id, email)
);

create index if not exists company_members_user_idx on public.company_members(user_id, company_id);
create index if not exists company_projects_company_idx on public.company_projects(company_id, added_at);
create index if not exists company_project_assignments_project_idx on public.company_project_assignments(company_id, project_id);
create index if not exists company_invitations_email_idx on public.company_invitations(lower(email), accepted_at);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.company_projects enable row level security;
alter table public.company_project_assignments enable row level security;
alter table public.company_invitations enable row level security;

-- SECURITY DEFINER helpers avoid recursive RLS references when policies check company membership.
create or replace function public.is_company_member(target_company uuid)
returns boolean language sql stable security definer set search_path = ''
as $
  select exists (select 1 from public.company_members m where m.company_id = target_company and m.user_id = (select auth.uid()))
$;
create or replace function public.is_company_admin(target_company uuid)
returns boolean language sql stable security definer set search_path = ''
as $
  select exists (select 1 from public.company_members m where m.company_id = target_company and m.user_id = (select auth.uid()) and m.role = 'admin')
$;
revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.is_company_admin(uuid) from public;
grant execute on function public.is_company_member(uuid), public.is_company_admin(uuid) to authenticated;

drop policy if exists "Company members can read their companies" on public.companies;
create policy "Company members can read their companies" on public.companies
  for select to authenticated using (
    public.is_company_member(companies.id)
  );

drop policy if exists "Company admins can update company profile" on public.companies;
create policy "Company admins can update company profile" on public.companies
  for update to authenticated using (
    public.is_company_admin(companies.id)
  ) with check (
    public.is_company_admin(companies.id)
  );

drop policy if exists "Company members can read their company roster" on public.company_members;
create policy "Company members can read their company roster" on public.company_members
  for select to authenticated using (
    public.is_company_member(company_members.company_id)
  );

drop policy if exists "Company admins can update member records" on public.company_members;
create policy "Company admins can update member records" on public.company_members
  for update to authenticated using (
    public.is_company_admin(company_members.company_id)
    and company_members.user_id <> (select auth.uid())
  ) with check (
    public.is_company_admin(company_members.company_id)
  );

drop policy if exists "Company admins can remove other members" on public.company_members;
create policy "Company admins can remove other members" on public.company_members
  for delete to authenticated using (
    public.is_company_admin(company_members.company_id)
    and company_members.user_id <> (select auth.uid())
  );

drop policy if exists "Company members can view linked projects" on public.company_projects;
create policy "Company members can view linked projects" on public.company_projects
  for select to authenticated using (
    public.is_company_member(company_projects.company_id)
  );

drop policy if exists "Company members can view project assignments" on public.company_project_assignments;
create policy "Company members can view project assignments" on public.company_project_assignments
  for select to authenticated using (
    public.is_company_member(company_project_assignments.company_id)
  );

drop policy if exists "Company admins can manage project assignments" on public.company_project_assignments;
create policy "Company admins can manage project assignments" on public.company_project_assignments
  for all to authenticated using (
    public.is_company_admin(company_project_assignments.company_id)
  ) with check (
    public.is_company_admin(company_project_assignments.company_id)
  );

drop policy if exists "Company admins can view invitations" on public.company_invitations;
create policy "Company admins can view invitations" on public.company_invitations
  for select to authenticated using (
    public.is_company_admin(company_invitations.company_id)
  );

grant select on public.companies, public.company_members, public.company_projects, public.company_project_assignments, public.company_invitations to authenticated;
revoke update on public.companies, public.company_members, public.company_project_assignments from authenticated;
grant update (name, slug, logo_url, theme, updated_at) on public.companies to authenticated;
grant update (role, full_name, job_title) on public.company_members to authenticated;
grant delete on public.company_members to authenticated;
grant select, insert, update, delete on public.company_project_assignments to authenticated;

create or replace function public.create_company(p_name text, p_slug text, p_logo_url text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  new_company uuid;
  clean_name text := trim(coalesce(p_name, ''));
  clean_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if actor is null then raise exception 'You must be signed in'; end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 120 then raise exception 'Company name must be 1–120 characters'; end if;
  if clean_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then raise exception 'Use a company URL name with 3–64 lowercase letters, numbers or hyphens'; end if;
  insert into public.companies(name, slug, logo_url, created_by)
    values (clean_name, clean_slug, nullif(trim(coalesce(p_logo_url, '')), ''), actor)
    returning id into new_company;
  insert into public.company_members(company_id, user_id, role, full_name)
    values (new_company, actor, 'admin', nullif(trim(coalesce((select u.raw_user_meta_data->>'full_name' from auth.users u where u.id = actor), '')), ''));
  return new_company;
end;
$$;
revoke all on function public.create_company(text,text,text) from public;
grant execute on function public.create_company(text,text,text) to authenticated;

create or replace function public.get_company_branding(p_slug text)
returns table(id uuid, name text, slug text, logo_url text, theme jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.slug, c.logo_url, c.theme
  from public.companies c
  where c.slug = lower(trim(p_slug))
  limit 1
$$;
revoke all on function public.get_company_branding(text) from public;
grant execute on function public.get_company_branding(text) to anon, authenticated;

create or replace function public.get_company_members(p_company_id uuid)
returns table(user_id uuid, email text, full_name text, role text, job_title text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
         u.email::text,
         coalesce(nullif(m.full_name,''), nullif(u.raw_user_meta_data->>'full_name',''), split_part(coalesce(u.email,''),'@',1)) as full_name,
         m.role,
         m.job_title,
         m.joined_at
  from public.company_members m
  join auth.users u on u.id = m.user_id
  where m.company_id = p_company_id
    and exists (select 1 from public.company_members v where v.company_id = p_company_id and v.user_id = (select auth.uid()))
  order by case when m.role = 'admin' then 0 else 1 end, full_name
$$;
revoke all on function public.get_company_members(uuid) from public;
grant execute on function public.get_company_members(uuid) to authenticated;

create or replace function public.get_company_profile_projects(p_company_id uuid)
returns table(project_id uuid, project_name text, project_description text, stage_id uuid, stage_name text, stage_start date, stage_end date, stage_order integer, assigned_employees text[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.description, s.id, s.name, s.start_date, s.end_date,
         coalesce(s.sort_order, 0),
         coalesce(array_agg(distinct coalesce(nullif(cm.full_name,''), nullif(u.raw_user_meta_data->>'full_name',''), u.email::text))
           filter (where cm.user_id is not null), array[]::text[])
  from public.company_projects cp
  join public.projects p on p.id = cp.project_id
  left join public.project_stages s on s.project_id = p.id
  left join public.company_project_assignments a on a.company_id = cp.company_id and a.project_id = cp.project_id
  left join public.company_members cm on cm.company_id = a.company_id and cm.user_id = a.user_id
  left join auth.users u on u.id = cm.user_id
  where cp.company_id = p_company_id
    and exists (select 1 from public.company_members m where m.company_id = p_company_id and m.user_id = (select auth.uid()))
  group by p.id, p.name, p.description, cp.added_at, s.id, s.name, s.start_date, s.end_date, s.sort_order
  order by p.name, coalesce(s.sort_order,0), s.start_date nulls last, s.name
$$;
revoke all on function public.get_company_profile_projects(uuid) from public;
grant execute on function public.get_company_profile_projects(uuid) to authenticated;

create or replace function public.link_company_project(p_company_id uuid, p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.company_members m where m.company_id = p_company_id and m.user_id = auth.uid() and m.role = 'admin') then
    raise exception 'Only company admins can link projects';
  end if;
  if coalesce(public.current_project_role(p_project_id)::text, '') not in ('owner','editor') then
    raise exception 'You need Owner or Editor access to that existing project before linking it to a company';
  end if;
  insert into public.company_projects(company_id, project_id, added_by)
    values (p_company_id, p_project_id, auth.uid())
    on conflict (company_id, project_id) do nothing;
end;
$$;
revoke all on function public.link_company_project(uuid,uuid) from public;
grant execute on function public.link_company_project(uuid,uuid) to authenticated;

create or replace function public.unlink_company_project(p_company_id uuid, p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.company_members m where m.company_id = p_company_id and m.user_id = auth.uid() and m.role = 'admin') then
    raise exception 'Only company admins can unlink projects';
  end if;
  delete from public.company_projects where company_id = p_company_id and project_id = p_project_id;
end;
$$;
revoke all on function public.unlink_company_project(uuid,uuid) from public;
grant execute on function public.unlink_company_project(uuid,uuid) to authenticated;

create or replace function public.accept_company_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  accepted_count integer := 0;
begin
  if actor is null then raise exception 'You must be signed in'; end if;
  select lower(u.email) into actor_email from auth.users u where u.id = actor;
  if actor_email is null then raise exception 'Your account does not have an email address'; end if;
  insert into public.company_members(company_id, user_id, role, full_name)
  select i.company_id, actor, i.role, nullif(trim(coalesce((select u.raw_user_meta_data->>'full_name' from auth.users u where u.id = actor), '')), '')
  from public.company_invitations i
  where lower(i.email) = actor_email and i.accepted_at is null
  on conflict (company_id, user_id) do nothing;
  get diagnostics accepted_count = row_count;
  update public.company_invitations i
    set accepted_by = actor, accepted_at = now()
    where lower(i.email) = actor_email and i.accepted_at is null;
  return accepted_count;
end;
$$;
revoke all on function public.accept_company_invitations() from public;
grant execute on function public.accept_company_invitations() to authenticated;

-- Public logo bucket; writes are restricted to company admins using a company-id folder.
insert into storage.buckets(id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "Company admins upload logos" on storage.objects;
create policy "Company admins upload logos" on storage.objects for insert to authenticated
with check (
  bucket_id = 'company-logos' and exists (
    select 1 from public.company_members m
    where m.company_id::text = split_part(name, '/', 1) and m.user_id = (select auth.uid()) and m.role = 'admin'
  )
);
drop policy if exists "Company admins update logos" on storage.objects;
create policy "Company admins update logos" on storage.objects for update to authenticated
using (
  bucket_id = 'company-logos' and exists (
    select 1 from public.company_members m
    where m.company_id::text = split_part(name, '/', 1) and m.user_id = (select auth.uid()) and m.role = 'admin'
  )
) with check (
  bucket_id = 'company-logos' and exists (
    select 1 from public.company_members m
    where m.company_id::text = split_part(name, '/', 1) and m.user_id = (select auth.uid()) and m.role = 'admin'
  )
);
drop policy if exists "Company admins delete logos" on storage.objects;
create policy "Company admins delete logos" on storage.objects for delete to authenticated
using (
  bucket_id = 'company-logos' and exists (
    select 1 from public.company_members m
    where m.company_id::text = split_part(name, '/', 1) and m.user_id = (select auth.uid()) and m.role = 'admin'
  )
);

grant usage on schema public to authenticated, anon;
