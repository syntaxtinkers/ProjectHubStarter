-- Weekly work dashboards and daily progress records.
-- Additive migration only. Existing projects, stages, tasks, and memberships are preserved.
alter table public.project_tasks
  add column if not exists assigned_to_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists project_tasks_assignee_dates_idx
  on public.project_tasks(assigned_to_user_id, start_date, due_date)
  where assigned_to_user_id is not null;
create index if not exists project_tasks_assigner_dates_idx
  on public.project_tasks(assigned_by_user_id, start_date, due_date)
  where assigned_by_user_id is not null;

create table if not exists public.task_daily_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  work_date date not null,
  week_start date not null,
  status text not null default 'not_started' check (status in ('not_started','ongoing','completed')),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  is_automatic boolean not null default false,
  unique (task_id, user_id, work_date),
  check (extract(isodow from week_start) = 1),
  check (week_start <= work_date and work_date < week_start + 7)
);
alter table public.task_daily_updates add column if not exists is_automatic boolean not null default false;
create index if not exists task_daily_updates_user_week_idx on public.task_daily_updates(user_id, week_start, work_date);
create index if not exists task_daily_updates_task_date_idx on public.task_daily_updates(task_id, work_date);
alter table public.task_daily_updates enable row level security;

DO $safe_policy$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_daily_updates' AND policyname = 'Users read daily updates for accessible assigned tasks'
  ) THEN
    EXECUTE $policy_body$create policy "Users read daily updates for accessible assigned tasks"
on public.task_daily_updates for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.project_tasks t
    where t.id = task_daily_updates.task_id
      and (t.assigned_by_user_id = (select auth.uid()) or t.created_by = (select auth.uid()))
  )
  or exists (
    select 1 from public.project_tasks t
    join public.company_projects cp on cp.project_id = t.project_id
    where t.id = task_daily_updates.task_id and public.is_company_admin(cp.company_id)
  )
)$policy_body$;
  END IF;
END $safe_policy$;
DO $safe_policy$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_daily_updates' AND policyname = 'Users create their own daily updates'
  ) THEN
    EXECUTE $policy_body$create policy "Users create their own daily updates"
on public.task_daily_updates for insert to authenticated
with check (
  user_id = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (select 1 from public.project_tasks t where t.id = task_daily_updates.task_id and t.assigned_to_user_id = (select auth.uid()))
)$policy_body$;
  END IF;
END $safe_policy$;
DO $safe_policy$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_daily_updates' AND policyname = 'Users update their own daily updates'
  ) THEN
    EXECUTE $policy_body$create policy "Users update their own daily updates"
on public.task_daily_updates for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.project_tasks t where t.id = task_daily_updates.task_id and t.assigned_to_user_id = (select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (select 1 from public.project_tasks t where t.id = task_daily_updates.task_id and t.assigned_to_user_id = (select auth.uid()))
)$policy_body$;
  END IF;
END $safe_policy$;
grant select, insert, update on public.task_daily_updates to authenticated;
grant all privileges on public.task_daily_updates to service_role;

create or replace function public.company_weekly_completion(
  p_company_id uuid,
  p_week_start date default ((now() at time zone 'Asia/Kolkata')::date - (extract(isodow from (now() at time zone 'Asia/Kolkata')::date)::int - 1))
)
returns table(user_id uuid, employee_name text, role text, total_work bigint, completed_work bigint, completion_percent integer)
language sql stable security definer set search_path = ''
as $$
  with members as (
    select cm.user_id, coalesce(nullif(trim(cm.full_name), ''), au.email, 'Employee') as employee_name, cm.role
    from public.company_members cm join auth.users au on au.id = cm.user_id
    where cm.company_id = p_company_id
  ),
  assigned_tasks as (
    select distinct t.id as task_id, t.assigned_to_user_id as user_id, t.status as task_status
    from public.project_tasks t
    join public.company_projects cp on cp.project_id = t.project_id and cp.company_id = p_company_id
    where t.assigned_to_user_id is not null
      and (
        (coalesce(t.start_date, t.due_date) <= p_week_start + 6 and coalesce(t.due_date, t.start_date) >= p_week_start)
        or (coalesce(t.due_date, t.start_date) < p_week_start and t.status <> 'done')
      )
  ),
  progress as (
    select at.user_id, count(*) as total_work,
      count(*) filter (where at.task_status = 'done' or exists (
        select 1 from public.task_daily_updates du
        where du.task_id = at.task_id and du.user_id = at.user_id
          and du.week_start = p_week_start and du.status = 'completed'
      )) as completed_work
    from assigned_tasks at group by at.user_id
  )
  select m.user_id, m.employee_name, m.role, coalesce(p.total_work,0)::bigint, coalesce(p.completed_work,0)::bigint,
    case when coalesce(p.total_work,0)=0 then 100
      else round(100.0 * coalesce(p.completed_work,0) / p.total_work)::integer end
  from members m left join progress p on p.user_id = m.user_id
  where public.is_company_admin(p_company_id)
  order by m.role, m.employee_name;
$$;
revoke all on function public.company_weekly_completion(uuid,date) from public;
grant execute on function public.company_weekly_completion(uuid,date) to authenticated;

create or replace function public.guard_task_assignment_users()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.assigned_to_user_id is not null and not exists (
    select 1 from public.project_members pm where pm.project_id = new.project_id and pm.user_id = new.assigned_to_user_id
  ) then
    raise exception 'The assignee must already have access to this project';
  end if;
  if new.assigned_to_user_id is not null and new.assigned_by_user_id is null then
    new.assigned_by_user_id := auth.uid();
  end if;
  return new;
end;
$$;
DO $safe_trigger$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND event_object_table = 'project_tasks' AND trigger_name = 'project_tasks_guard_assignment_users'
  ) THEN
    EXECUTE $trigger_body$create trigger project_tasks_guard_assignment_users
before insert or update of project_id, assigned_to_user_id, assigned_by_user_id on public.project_tasks
for each row execute function public.guard_task_assignment_users()$trigger_body$;
  END IF;
END $safe_trigger$;

-- Private contact data is available only to company admins and service-side delivery.
create table if not exists public.company_member_contacts (
  company_id uuid not null references public.companies(id),
  user_id uuid not null references auth.users(id),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_opted_in boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (company_id,user_id),
  foreign key (company_id,user_id) references public.company_members(company_id,user_id) on delete cascade
);
alter table public.company_member_contacts add column if not exists whatsapp_opted_in boolean not null default false;
alter table public.company_member_contacts enable row level security;
DO $safe_policy$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_member_contacts' AND policyname = 'Company admins manage private member contacts'
  ) THEN
    EXECUTE $policy_body$create policy "Company admins manage private member contacts"
on public.company_member_contacts for all to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id))$policy_body$;
  END IF;
END $safe_policy$;
grant select,insert,update,delete on public.company_member_contacts to authenticated;
grant all privileges on public.company_member_contacts to service_role;

create or replace function public.get_company_daily_work_digest(p_date date default ((now() at time zone 'Asia/Kolkata')::date))
returns table(company_id uuid, company_name text, user_id uuid, employee_name text, phone_e164 text, work_items jsonb)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, cm.user_id, coalesce(nullif(trim(cm.full_name),''), au.email, 'Employee'),
    contact.phone_e164,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'project', p.name, 'stage', coalesce(s.name,'Stage'), 'task', t.title,
        'start_date', t.start_date, 'due_date', t.due_date, 'status', t.status
      ) order by coalesce(t.due_date,t.start_date,'9999-12-31'::date), p.name, t.title)
      from public.project_tasks t
      join public.projects p on p.id=t.project_id
      join public.company_projects cp on cp.project_id=p.id and cp.company_id=c.id
      left join public.project_stages s on s.id=t.stage_id
      where t.assigned_to_user_id=cm.user_id
        and t.status <> 'done'
        and (t.start_date is not null or t.due_date is not null)
        and (
          (t.start_date is not null and t.start_date <= p_date)
          or (t.due_date between p_date and p_date + 5)
          or (t.due_date < p_date)
        )
    ), '[]'::jsonb)
  from public.company_members cm
  join public.companies c on c.id=cm.company_id
  join auth.users au on au.id=cm.user_id
  join public.company_member_contacts contact on contact.company_id=cm.company_id and contact.user_id=cm.user_id
  where contact.phone_e164 is not null and contact.whatsapp_opted_in = true
  order by c.name, coalesce(nullif(trim(cm.full_name),''),au.email);
$$;
revoke all on function public.get_company_daily_work_digest(date) from public, anon, authenticated;
grant execute on function public.get_company_daily_work_digest(date) to service_role;

-- Mark unupdated assigned work as not started shortly after each workday ends.
create or replace function public.materialize_daily_work_defaults(p_date date default (((now() at time zone 'Asia/Kolkata')::date) - 1))
returns integer
language plpgsql security definer set search_path = ''
as $$
declare inserted_count integer := 0;
begin
  if extract(isodow from p_date) not between 1 and 6 then return 0; end if;
  insert into public.task_daily_updates(task_id,user_id,work_date,week_start,status,updated_by,is_automatic)
  select t.id, t.assigned_to_user_id, p_date, p_date - (extract(isodow from p_date)::int - 1),
    'not_started', t.assigned_to_user_id, true
  from public.project_tasks t
  where t.assigned_to_user_id is not null and t.status <> 'done'
    and coalesce(t.start_date,t.due_date) is not null and coalesce(t.start_date,t.due_date) <= p_date
    and not exists (
      select 1 from public.task_daily_updates existing
      where existing.task_id=t.id and existing.user_id=t.assigned_to_user_id and existing.work_date=p_date
    )
    and not exists (
      select 1 from public.task_daily_updates completed
      where completed.task_id=t.id and completed.user_id=t.assigned_to_user_id
        and completed.week_start=p_date - (extract(isodow from p_date)::int - 1)
        and completed.work_date<p_date and completed.status='completed'
    );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.materialize_daily_work_defaults(date) from public, anon, authenticated;
grant execute on function public.materialize_daily_work_defaults(date) to service_role;

-- The assigned employee can update today's status without project-editor permissions.
create or replace function public.set_task_daily_status(p_task_id uuid, p_work_date date, p_status text)
returns public.task_daily_updates
language plpgsql security definer set search_path = ''
as $$
declare caller_id uuid := auth.uid(); assigned_user uuid; week_monday date; saved_update public.task_daily_updates;
begin
  if caller_id is null then raise exception 'Sign in is required'; end if;
  if p_status not in ('not_started','ongoing','completed') then raise exception 'Invalid work status'; end if;
  if p_work_date <> ((now() at time zone 'Asia/Kolkata')::date) then raise exception 'Daily status can only be changed for today'; end if;
  select t.assigned_to_user_id into assigned_user from public.project_tasks t where t.id=p_task_id;
  if assigned_user is distinct from caller_id then raise exception 'You can update only work assigned to your account'; end if;
  week_monday := p_work_date - (extract(isodow from p_work_date)::int - 1);
  insert into public.task_daily_updates(task_id,user_id,work_date,week_start,status,updated_by,is_automatic)
  values (p_task_id,caller_id,p_work_date,week_monday,p_status,caller_id,false)
  on conflict (task_id,user_id,work_date)
  do update set status=excluded.status, updated_at=now(), updated_by=caller_id, is_automatic=false
  returning * into saved_update;
  update public.project_tasks
  set status = case p_status when 'completed' then 'done' when 'ongoing' then 'in_progress' else 'todo' end
  where id=p_task_id;
  return saved_update;
end;
$$;
revoke all on function public.set_task_daily_status(uuid,date,text) from public, anon;
grant execute on function public.set_task_daily_status(uuid,date,text) to authenticated;
