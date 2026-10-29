-- Additive work-session timers and approval workflow fields.
-- Existing attendance and leave rows are retained unchanged.
alter table public.company_attendance add column if not exists ended_at timestamptz;
alter table public.company_attendance add column if not exists paused_at timestamptz;
alter table public.company_attendance add column if not exists paused_seconds integer not null default 0;
alter table public.company_attendance add column if not exists work_state text not null default 'working';
alter table public.company_attendance add column if not exists work_location text not null default 'office';

-- Existing leave rows are treated as already accepted; new requests can be pending.
alter table public.company_leave add column if not exists approval_status text not null default 'approved';
alter table public.company_leave add column if not exists approved_by uuid references auth.users(id);
alter table public.company_leave add column if not exists decision_at timestamptz;
alter table public.company_leave add column if not exists approval_note text;

DO $approval_status$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.company_leave'::regclass AND conname='company_leave_approval_status_check') THEN
    ALTER TABLE public.company_leave ADD CONSTRAINT company_leave_approval_status_check CHECK (approval_status IN ('pending','approved','rejected'));
  END IF;
END; $approval_status$;

create index if not exists company_leave_approval_queue_idx on public.company_leave(company_id,approval_status,created_at desc);

-- Allow employees to pause/resume/end their own current-day work session.
DO $work_session_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_attendance' AND policyname='Employees manage own work session state') THEN
    CREATE POLICY "Employees manage own work session state" ON public.company_attendance
      FOR UPDATE TO authenticated
      USING (user_id=(select auth.uid()) AND attendance_date=((now() at time zone 'Asia/Kolkata')::date) AND public.is_company_member(company_id))
      WITH CHECK (user_id=(select auth.uid()) AND attendance_date=((now() at time zone 'Asia/Kolkata')::date) AND public.is_company_member(company_id));
  END IF;
END; $work_session_policy$;
GRANT UPDATE (ended_at, paused_at, paused_seconds, work_state, work_location) ON public.company_attendance TO authenticated;

-- Employees submit requests as pending; company admins can decide them.
GRANT INSERT (company_id, user_id, start_date, end_date, reason, approval_status) ON public.company_leave TO authenticated;
GRANT UPDATE (approval_status, approved_by, decision_at, approval_note) ON public.company_leave TO authenticated;
DO $leave_admin_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_leave' AND policyname='Company admins decide leave requests') THEN
    CREATE POLICY "Company admins decide leave requests" ON public.company_leave
      FOR UPDATE TO authenticated
      USING (public.is_company_admin(company_id))
      WITH CHECK (public.is_company_admin(company_id));
  END IF;
END; $leave_admin_policy$;

GRANT INSERT (company_id, user_id, attendance_date, work_mode, work_location) ON public.company_attendance TO authenticated;

-- Additive stage assignment fields and admin-only employee metrics. Existing rows are preserved.
alter table public.project_stages add column if not exists assigned_to_user_id uuid;
alter table public.project_stages add column if not exists assigned_by_user_id uuid;

create or replace function public.get_company_employee_metrics(p_company_id uuid)
returns table(user_id uuid,total_tasks bigint,completed_tasks bigint,total_stages bigint,completed_stages bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_company_admin(p_company_id) then
    raise exception 'Company admin access required';
  end if;
  return query
    with task_metrics as (
      select t.assigned_to_user_id as user_id, count(t.id)::bigint as total_tasks,
        count(t.id) filter (where t.status='done') as completed_tasks
      from public.project_tasks t join public.company_projects cp on cp.project_id=t.project_id
      where cp.company_id=p_company_id and t.assigned_to_user_id is not null
      group by t.assigned_to_user_id
    ), stage_metrics as (
      select s.assigned_to_user_id as user_id, count(s.id)::bigint as total_stages,
        count(s.id) filter (where not exists (select 1 from public.project_tasks t where t.stage_id=s.id and t.status<>'done')) as completed_stages
      from public.project_stages s join public.company_projects cp on cp.project_id=s.project_id
      where cp.company_id=p_company_id and s.assigned_to_user_id is not null
      group by s.assigned_to_user_id
    )
    select cm.user_id, coalesce(tm.total_tasks,0), coalesce(tm.completed_tasks,0), coalesce(sm.total_stages,0), coalesce(sm.completed_stages,0)
    from public.company_members cm left join task_metrics tm on tm.user_id=cm.user_id
    left join stage_metrics sm on sm.user_id=cm.user_id
    where cm.company_id=p_company_id;
end;
$$;
grant execute on function public.get_company_employee_metrics(uuid) to authenticated;
