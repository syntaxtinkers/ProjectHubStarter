-- Additive work-session timers and approval workflow fields.
-- Existing attendance and leave rows are retained unchanged.
alter table public.company_attendance add column if not exists ended_at timestamptz;
alter table public.company_attendance add column if not exists paused_at timestamptz;
alter table public.company_attendance add column if not exists paused_seconds integer not null default 0;
alter table public.company_attendance add column if not exists work_state text not null default 'working';

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
