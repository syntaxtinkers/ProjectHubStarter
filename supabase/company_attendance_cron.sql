-- SCHEDULE SETUP: run only after deploying send-attendance-digest.
-- Supabase Cron uses the database scheduler; this schedule is 10:00 AM in India Standard Time (UTC+05:30).
-- The Edge Function is deployed with --no-verify-jwt and verifies x-cron-secret itself.
--
-- 1) Replace the two placeholders below, then run this SQL once:
--    PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
--    PASTE_THE_SAME_RANDOM_SECRET_YOU_SET_AS_CRON_SECRET
-- 2) Before enabling delivery, configure WhatsApp Edge Function secrets and test the group ID.
-- 3) Re-running cron.schedule with the same job name replaces that named job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(
  'PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
  'company_attendance_publishable_key'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'company_attendance_publishable_key'
);

select vault.create_secret(
  'PASTE_THE_SAME_RANDOM_SECRET_YOU_SET_AS_CRON_SECRET',
  'company_attendance_cron_secret'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'company_attendance_cron_secret'
);

select vault.create_secret(
  'https://grpxmljjeoaegkkdaiud.supabase.co',
  'company_attendance_project_url'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'company_attendance_project_url'
);

select cron.schedule(
  'company-attendance-whatsapp-10am-ist',
  '30 4 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'company_attendance_project_url')
      || '/functions/v1/send-attendance-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'company_attendance_publishable_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'company_attendance_cron_secret')
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'timezone', 'Asia/Kolkata')
  ) as request_id;
  $$
);


-- Individual task messages use approved WhatsApp templates and employee E.164 numbers.
-- Daily assigned-work digest: 08:00 Asia/Kolkata (02:30 UTC).
select cron.schedule(
  'company-work-digest-8am-ist',
  '30 2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'company_attendance_project_url')
      || '/functions/v1/send-daily-work-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'company_attendance_publishable_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'company_attendance_cron_secret')
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'mode', 'daily_digest', 'timezone', 'Asia/Kolkata')
  ) as request_id;
  $$
);

-- Evening schedule-update reminder: 19:00 Asia/Kolkata (13:30 UTC).
select cron.schedule(
  'company-work-reminder-7pm-ist',
  '30 13 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'company_attendance_project_url')
      || '/functions/v1/send-daily-work-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'company_attendance_publishable_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'company_attendance_cron_secret')
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'mode', 'evening_reminder', 'timezone', 'Asia/Kolkata')
  ) as request_id;
  $$
);


-- Auto-mark unupdated assigned work as "not started" shortly after each workday ends.
-- The function skips Sunday and never overwrites an employee's explicit status.
select cron.schedule(
  'company-daily-work-default-status',
  '35 18 * * *',
  $ select public.materialize_daily_work_defaults(((now() at time zone 'Asia/Kolkata')::date - 1)); $
);
