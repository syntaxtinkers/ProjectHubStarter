-- Company attendance, leave, and daily WhatsApp reminders.
-- Apply after supabase/company_workspaces.sql. Additive; no existing projects/tasks are modified.
create extension if not exists pgcrypto;

create table if not exists public.company_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attendance_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  work_mode text not null check (work_mode in ('office','work_from_home')),
  started_at timestamptz not null default now(),
  editable_until timestamptz not null default (now() + interval '1 hour'),
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, user_id, attendance_date)
);

create table if not exists public.company_leave (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text check (reason is null or char_length(reason) <= 1000),
  status text not null default 'active' check (status in ('active','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.company_whatsapp_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  group_name text not null default 'Brickmen group' check (char_length(trim(group_name)) between 1 and 120),
  group_id text not null,
  enabled boolean not null default false,
  timezone text not null default 'Asia/Kolkata',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (timezone = 'Asia/Kolkata')
);

create table if not exists public.company_attendance_notification_runs (
  company_id uuid not null references public.companies(id) on delete cascade,
  attendance_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','error')),
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (company_id, attendance_date, user_id)
);

create index if not exists company_attendance_date_idx on public.company_attendance(company_id, attendance_date, user_id);
create index if not exists company_leave_date_idx on public.company_leave(company_id, start_date, end_date) where status = 'active';
create index if not exists company_attendance_runs_date_idx on public.company_attendance_notification_runs(attendance_date, status);

alter table public.company_attendance enable row level security;
alter table public.company_leave enable row level security;
alter table public.company_whatsapp_settings enable row level security;
alter table public.company_attendance_notification_runs enable row level security;

drop policy if exists "Members read own or admins read company attendance" on public.company_attendance;
create policy "Members read own or admins read company attendance" on public.company_attendance
for select to authenticated using (
  public.is_company_member(company_id) and (user_id = (select auth.uid()) or public.is_company_admin(company_id))
);

drop policy if exists "Employees insert own attendance" on public.company_attendance;
create policy "Employees insert own attendance" on public.company_attendance
for insert to authenticated with check (
  user_id = (select auth.uid())
  and public.is_company_member(company_id)
  and attendance_date = ((now() at time zone 'Asia/Kolkata')::date)
);

drop policy if exists "Employees can update attendance within one hour" on public.company_attendance;
create policy "Employees can update attendance within one hour" on public.company_attendance
for update to authenticated using (
  user_id = (select auth.uid())
  and editable_until > now()
  and frozen_at is null
  and public.is_company_member(company_id)
) with check (
  user_id = (select auth.uid())
  and editable_until > now()
  and frozen_at is null
  and public.is_company_member(company_id)
);

drop policy if exists "Members read own leave or admins read company leave" on public.company_leave;
create policy "Members read own leave or admins read company leave" on public.company_leave
for select to authenticated using (
  public.is_company_member(company_id) and (user_id = (select auth.uid()) or public.is_company_admin(company_id))
);

drop policy if exists "Employees submit own leave" on public.company_leave;
create policy "Employees submit own leave" on public.company_leave
for insert to authenticated with check (
  user_id = (select auth.uid())
  and public.is_company_member(company_id)
  and start_date >= ((now() at time zone 'Asia/Kolkata')::date)
  and end_date >= start_date
  and status = 'active'
);

drop policy if exists "Employees edit upcoming leave" on public.company_leave;
create policy "Employees edit upcoming leave" on public.company_leave
for update to authenticated using (
  user_id = (select auth.uid())
  and start_date >= ((now() at time zone 'Asia/Kolkata')::date)
  and public.is_company_member(company_id)
) with check (
  user_id = (select auth.uid())
  and start_date >= ((now() at time zone 'Asia/Kolkata')::date)
  and end_date >= start_date
  and public.is_company_member(company_id)
);

drop policy if exists "Company admins read WhatsApp delivery settings" on public.company_whatsapp_settings;
create policy "Company admins read WhatsApp delivery settings" on public.company_whatsapp_settings
for select to authenticated using (public.is_company_admin(company_id));

drop policy if exists "Company admins save WhatsApp delivery settings" on public.company_whatsapp_settings;
create policy "Company admins save WhatsApp delivery settings" on public.company_whatsapp_settings
for all to authenticated using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

drop policy if exists "Company admins can read notification delivery status" on public.company_attendance_notification_runs;
create policy "Company admins can read notification delivery status" on public.company_attendance_notification_runs
for select to authenticated using (public.is_company_admin(company_id));

grant select on public.company_attendance, public.company_leave, public.company_whatsapp_settings, public.company_attendance_notification_runs to authenticated;
grant select, insert, update on public.company_attendance_notification_runs to service_role;
revoke insert, update, delete on public.company_attendance, public.company_leave, public.company_whatsapp_settings from authenticated;
grant insert (company_id, user_id, attendance_date, work_mode) on public.company_attendance to authenticated;
grant update (work_mode) on public.company_attendance to authenticated;
grant insert (company_id, user_id, start_date, end_date, reason) on public.company_leave to authenticated;
grant update (start_date, end_date, reason, status, updated_at) on public.company_leave to authenticated;
grant insert, update on public.company_whatsapp_settings to authenticated;

create or replace function public.guard_company_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then raise exception 'You can only submit your own attendance'; end if;
    if not public.is_company_member(new.company_id) then raise exception 'You are not a member of this company'; end if;
    if new.attendance_date <> ((now() at time zone 'Asia/Kolkata')::date) then raise exception 'Attendance can only be submitted for today'; end if;
    new.started_at := now();
    new.editable_until := now() + interval '1 hour';
    new.frozen_at := null;
    return new;
  end if;
  if new.id is distinct from old.id or new.company_id is distinct from old.company_id
     or new.user_id is distinct from old.user_id or new.attendance_date is distinct from old.attendance_date
     or new.started_at is distinct from old.started_at or new.editable_until is distinct from old.editable_until
     or new.frozen_at is distinct from old.frozen_at then
    raise exception 'The attendance entry time and identity cannot be changed';
  end if;
  if old.user_id <> auth.uid() then raise exception 'You can only edit your own attendance'; end if;
  if old.frozen_at is not null or now() > old.editable_until then raise exception 'Attendance is frozen one hour after submission'; end if;
  if new.work_mode not in ('office','work_from_home') then raise exception 'Choose office or work from home'; end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_attendance_guard on public.company_attendance;
create trigger company_attendance_guard before insert or update on public.company_attendance
for each row execute function public.guard_company_attendance();

create or replace function public.guard_company_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then raise exception 'You can only submit leave for yourself'; end if;
    if not public.is_company_member(new.company_id) then raise exception 'You are not a member of this company'; end if;
    if new.start_date < ((now() at time zone 'Asia/Kolkata')::date) then raise exception 'Leave cannot start in the past'; end if;
    new.status := 'active';
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.id is distinct from old.id or new.company_id is distinct from old.company_id or new.user_id is distinct from old.user_id then
    raise exception 'Leave ownership cannot be changed';
  end if;
  if old.user_id <> auth.uid() then raise exception 'You can only edit your own leave'; end if;
  if old.start_date < ((now() at time zone 'Asia/Kolkata')::date) then raise exception 'Leave that has started cannot be edited'; end if;
  if new.start_date < ((now() at time zone 'Asia/Kolkata')::date) or new.end_date < new.start_date then raise exception 'Choose a valid future leave period'; end if;
  if new.status not in ('active','cancelled') then raise exception 'Invalid leave status'; end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_leave_guard on public.company_leave;
create trigger company_leave_guard before insert or update on public.company_leave
for each row execute function public.guard_company_leave();

create or replace function public.get_company_attendance_schedule(p_company_id uuid, p_date date default ((now() at time zone 'Asia/Kolkata')::date))
returns table(
  user_id uuid, employee_name text, employee_email text, attendance_date date,
  attendance_status text, work_mode text, started_at timestamptz, editable_until timestamptz,
  is_frozen boolean, leave_start date, leave_end date, leave_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_company_admin(p_company_id) then raise exception 'Only company admins can view the full attendance schedule'; end if;
  return query
  select cm.user_id,
    coalesce(nullif(cm.full_name,''), nullif(u.raw_user_meta_data->>'full_name',''), split_part(coalesce(u.email,''),'@',1)),
    u.email::text,
    p_date,
    case when l.id is not null then 'on_leave' when a.id is not null then 'working' else 'not_signed_in' end,
    a.work_mode, a.started_at, a.editable_until,
    coalesce(a.frozen_at is not null or a.editable_until <= now(), false),
    l.start_date, l.end_date, l.reason
  from public.company_members cm
  join auth.users u on u.id = cm.user_id
  left join public.company_attendance a on a.company_id = cm.company_id and a.user_id = cm.user_id and a.attendance_date = p_date
  left join lateral (
    select leave_row.id, leave_row.start_date, leave_row.end_date, leave_row.reason
    from public.company_leave leave_row
    where leave_row.company_id = cm.company_id and leave_row.user_id = cm.user_id
      and leave_row.status = 'active' and p_date between leave_row.start_date and leave_row.end_date
    order by leave_row.start_date
    limit 1
  ) l on true
  where cm.company_id = p_company_id and cm.role = 'employee'
  order by coalesce(nullif(cm.full_name,''), split_part(coalesce(u.email,''),'@',1));
end;
$$;
revoke all on function public.get_company_attendance_schedule(uuid,date) from public;
grant execute on function public.get_company_attendance_schedule(uuid,date) to authenticated;

-- Only the server-side scheduled Edge Function can read the daily notification snapshot.
create or replace function public.get_company_attendance_notification_rows(p_date date default ((now() at time zone 'Asia/Kolkata')::date))
returns table(
  company_id uuid, company_name text, group_id text, group_name text,
  user_id uuid, employee_name text, attendance_date date,
  attendance_status text, work_mode text, started_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, s.group_id, s.group_name, cm.user_id,
    coalesce(nullif(cm.full_name,''), nullif(u.raw_user_meta_data->>'full_name',''), split_part(coalesce(u.email,''),'@',1)),
    p_date,
    case when l.user_id is not null then 'on_leave' when a.id is not null then 'working' else 'not_signed_in' end,
    a.work_mode, a.started_at
  from public.company_whatsapp_settings s
  join public.companies c on c.id = s.company_id
  join public.company_members cm on cm.company_id = s.company_id and cm.role = 'employee'
  join auth.users u on u.id = cm.user_id
  left join public.company_attendance a on a.company_id = cm.company_id and a.user_id = cm.user_id and a.attendance_date = p_date
  left join lateral (
    select l.user_id from public.company_leave l
    where l.company_id = cm.company_id and l.user_id = cm.user_id and l.status = 'active'
      and p_date between l.start_date and l.end_date
    order by l.start_date limit 1
  ) l on true
  where s.enabled = true
  order by c.name, employee_name
$$;
revoke all on function public.get_company_attendance_notification_rows(date) from public, anon, authenticated;
grant execute on function public.get_company_attendance_notification_rows(date) to service_role;

-- The notification log has no client write policy. Only the server's service-role client writes it.
grant select on public.company_attendance_notification_runs to authenticated;

-- Add updated_at for the attendance record with an additive nullable column for older previews.
alter table public.company_attendance add column if not exists updated_at timestamptz not null default now();
