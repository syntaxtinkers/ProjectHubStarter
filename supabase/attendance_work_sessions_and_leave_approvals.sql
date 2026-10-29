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
