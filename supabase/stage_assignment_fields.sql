-- Additive stage assignment fields. Existing stages and data are preserved.
alter table public.project_stages add column if not exists assigned_to_user_id uuid;
alter table public.project_stages add column if not exists assigned_by_user_id uuid;

-- Backfill assigner from the existing creator column only; do not change stage content.
update public.project_stages set assigned_by_user_id = created_by where assigned_by_user_id is null and created_by is not null;
