-- ProjectHub compact tables and durable ordering.
-- Additive only: no existing rows are deleted or rewritten.
begin;

alter table public.project_stages
  add column if not exists sort_order integer;
alter table public.project_tasks
  add column if not exists sort_order integer;

-- Seed ordering only for rows whose new order is unset.
with ranked as (
  select id, row_number() over (
    partition by project_id order by created_at asc, id asc
  ) - 1 as n
  from public.project_stages
  where sort_order is null
)
update public.project_stages s set sort_order = ranked.n
from ranked where s.id = ranked.id;

with ranked as (
  select id, row_number() over (
    partition by stage_id order by created_at asc, id asc
  ) - 1 as n
  from public.project_tasks
  where sort_order is null
)
update public.project_tasks t set sort_order = ranked.n
from ranked where t.id = ranked.id;

create index if not exists project_stages_project_sort_idx
  on public.project_stages(project_id, sort_order, created_at);
create index if not exists project_tasks_stage_sort_idx
  on public.project_tasks(project_id, stage_id, sort_order, created_at);

-- Allow editors to delete a custom column only after the app's explicit confirmation.
drop policy if exists "Editors can delete project task custom fields" on public.project_task_custom_fields;
create policy "Editors can delete project task custom fields"
  on public.project_task_custom_fields
  for delete to authenticated
  using (public.current_project_role(project_id) in ('owner', 'editor'));
grant delete on public.project_task_custom_fields to authenticated;

commit;
