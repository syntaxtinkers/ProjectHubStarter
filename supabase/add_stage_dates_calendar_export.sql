-- ProjectHub additive migration: stage dates and task date boundaries
-- Safe to rerun. Adds columns and validation only; does not delete or rewrite saved records.
-- Run this after rebuild_stages.sql has been applied.

alter table public.project_stages
  add column if not exists start_date date,
  add column if not exists end_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_stages_dates_valid'
      and conrelid = 'public.project_stages'::regclass
  ) then
    alter table public.project_stages
      add constraint project_stages_dates_valid
      check (start_date is null or end_date is null or end_date >= start_date) not valid;
  end if;
end $$;

alter table public.project_stages validate constraint project_stages_dates_valid;

create or replace function public.validate_project_stage_dates()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.start_date is not null and new.end_date is not null and new.end_date < new.start_date then
    raise exception 'Stage end date cannot be earlier than its start date';
  end if;

  if exists (
    select 1
    from public.project_tasks t
    where t.stage_id = new.id
      and (
        (new.start_date is not null and (
          (t.start_date is not null and t.start_date < new.start_date) or
          (t.due_date is not null and t.due_date < new.start_date)
        )) or
        (new.end_date is not null and (
          (t.start_date is not null and t.start_date > new.end_date) or
          (t.due_date is not null and t.due_date > new.end_date)
        ))
      )
  ) then
    raise exception 'Stage dates cannot exclude existing task dates. Adjust task dates first.';
  end if;
  return new;
end;
$function$;

drop trigger if exists project_stages_validate_dates on public.project_stages;
create trigger project_stages_validate_dates
before insert or update of start_date, end_date on public.project_stages
for each row execute function public.validate_project_stage_dates();

create or replace function public.validate_task_dates_within_stage()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  stage_start date;
  stage_end date;
begin
  select s.start_date, s.end_date
    into stage_start, stage_end
  from public.project_stages s
  where s.id = new.stage_id
    and s.project_id = new.project_id;

  if not found then
    raise exception 'Task stage must belong to the same project as the task';
  end if;

  if stage_start is not null and (
    (new.start_date is not null and new.start_date < stage_start) or
    (new.due_date is not null and new.due_date < stage_start)
  ) then
    raise exception 'Task dates cannot be before the stage start date (%)', stage_start;
  end if;

  if stage_end is not null and (
    (new.start_date is not null and new.start_date > stage_end) or
    (new.due_date is not null and new.due_date > stage_end)
  ) then
    raise exception 'Task dates cannot be after the stage end date (%)', stage_end;
  end if;

  return new;
end;
$function$;

drop trigger if exists project_tasks_validate_stage_dates on public.project_tasks;
create trigger project_tasks_validate_stage_dates
before insert or update of project_id, stage_id, start_date, due_date on public.project_tasks
for each row execute function public.validate_task_dates_within_stage();
