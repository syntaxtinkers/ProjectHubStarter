-- ProjectHub work sessions and approval-based leave requests.
-- Additive only: existing attendance and leave rows are retained.
alter table public.company_attendance add column if not exists ended_at timestamptz;
alter table public.company_attendance add column if not exists paused_at timestamptz;
alter table public.company_attendance add column if not exists paused_seconds integer not null default 0;
alter table public.company_attendance add column if not exists work_state text not null default 'working';

-- Keep existing leave history; new requests enter the approval queue.
alter table public.company_leave add column if not exists approved_by uuid references auth.users(id);
alter table public.company_leave add column if not exists decision_at timestamptz;
alter table public.company_leave add column if not exists approval_note text;

-- Widen the existing status constraint safely by replacing only that named constraint.
do $leave_status$ begin
  if exists (select 1 from pg_constraint where conrelid='public.company_leave'::regclass and conname='company_leave_status_check') then
    alter table public.company_leave drop constraint company_leave_status_check;
  end if;
  alter table public.company_leave add constraint company_leave_status_check check (status in ('pending','approved','rejected','active','cancelled'));
end; $leave_status$;

create index if not exists company_leave_pending_idx on public.company_leave(company_id,status,created_at desc);
