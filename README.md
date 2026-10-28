# ProjectHub — collaboration starter (feature-upgraded)

ProjectHub is a responsive React + TypeScript + Supabase web app. This branch adds company workspaces alongside the existing project-based structure, a company-level stage/deadline table and Gantt timeline, company invitations, logo/theme settings, attendance and leave records, and a scheduled WhatsApp attendance integration. It is not a complete Bitrix24 clone. Existing projects remain personal unless a company admin explicitly links them.

## Current features

- Supabase email/password sign-up and sign-in, Google OAuth, forgot-password email, and password reset.
- Browser password-manager save/autofill support via standard email/password autocomplete attributes.
- Optional company workspaces created from Settings; each company has its own name, slug, logo, theme, admins, and employees.
- Company invitation emails for partner/admin or employee roles (Edge Function + Resend configuration required).
- Company profile with an Excel-style project/stage/deadline table and an extended stage Gantt; the company profile does not query or display task-level records.
- Admin-only company profile edits, member roles/job titles, project linking/unlinking, and project assignments.
- Existing personal projects remain personal until an admin links them. Linking/unlinking affects only the company relationship, not project/task/stage data.
- Six shared theme presets and company-scoped theme color customization, logo, and invitation/login branding.
- Employee self-check-in (office / work from home), a one-hour correction window, leave date ranges, and an admin-only employee attendance schedule.
- Optional 10:00 AM India-time WhatsApp attendance reminders through the WhatsApp Groups API (credentials, scheduled job, eligible business account, and API-enabled group are required).
- Private multi-project dashboard and project creation.
- Project discussion comments.
- Tasks with status, priority, start date and due date.
- Kanban board (To do / In progress / Done).
- Gantt-style 21-day timeline.
- Project member roster and owner-only role management.
- Add an existing registered Supabase user to a project by email.
- Roles: Owner/Main editor, Editor, Commenter, Viewer.
- Browser-saved appearance settings: background, panel, text, accent, font size, dark/light preference.
- Responsive desktop/mobile layout.
- Row Level Security policies for tasks and project membership.

## Important limitations

- Company invitation email depends on deploying the invite-company-member Edge Function and setting the Resend sender/API secrets as described below. Never put service-role or WhatsApp access tokens in frontend code.
- Gantt is a lightweight timeline view, not a full dependency-aware scheduler. Task date editing and dependency links are not implemented yet.
- File storage, real-time chat, email/push notifications, recurring tasks, time tracking, CRM, automation rules, and a full activity/audit feed are not implemented in this release.
- Personal appearance preferences remain browser-local when no company is active. Company profile colors and logos are stored in Supabase and shared with members of that company only.
- Google OAuth, password-reset delivery, and company-invitation emails need provider credentials/redirect URLs. They are not usable until the Supabase dashboard and secrets are configured.
- WhatsApp message delivery is not active until the Edge Function, secrets, SQL schedule, and an eligible WhatsApp Groups API destination are configured and tested. The official Groups API does not let an arbitrary personal WhatsApp group be assumed usable.
- The app has not undergone a production security audit or full end-to-end testing. Test with separate accounts before inviting a real team.

## Update your existing Supabase project

You already ran `supabase/schema.sql` for the starter. **Do not rerun the starter schema unnecessarily.** To add tasks and existing-user member addition:

1. Open the Supabase dashboard for the same ProjectHub project.
2. Go to **SQL Editor → New query**.
3. Open `supabase/upgrade_features.sql` from this ZIP.
4. Copy the entire file into the SQL Editor and click **Run**.
5. Confirm it reports success.

This migration is designed to be re-runnable. It creates `project_tasks`, task RLS policies, and the `add_project_member_by_email` RPC.

### Add company workspaces (preserves existing project data)

After the previous migrations above succeed, apply the file supabase/company_workspaces.sql in the SQL Editor of the same Supabase project. This is additive. It creates the company/member/project-link/theme tables and secure summary functions; it does not auto-link old projects or change task/stage rows.

Then apply supabase/company_attendance.sql. This creates attendance, leave, and WhatsApp-settings tables. Attendance can only be submitted for today's India date, and the work location is editable for one hour after check-in. Employees can see their own entries; company admins can see the company-wide attendance schedule.

Do not run supabase/company_attendance_cron.sql until the WhatsApp Edge Function secrets are configured and a valid Groups API group ID is provided. That file schedules a 10:00 AM Asia/Kolkata job. Never paste secrets into GitHub or frontend code.

### Configure Google sign-in and password reset

1. In Google Cloud Console, create an OAuth client for a Web application.
2. Add this Supabase callback URL to the Google OAuth client's authorised redirect URIs: https://grpxmljjeoaegkkdaiud.supabase.co/auth/v1/callback
3. In Supabase Dashboard → Authentication → Sign In / Providers, enable Google and enter the client ID and client secret.
4. In Supabase Dashboard → Authentication → URL Configuration, add the production app URL, Vercel preview URL(s), and local development URL to the allowed redirect URLs.
5. Configure SMTP/email delivery in Supabase Auth before relying on password-reset and invitation emails in production.

### Configure company invitation emails

From the repository folder, link the Supabase CLI to the same project and deploy the Edge Function. Configure the Resend sender/API secrets securely:

    supabase login
    supabase link --project-ref grpxmljjeoaegkkdaiud
    supabase functions deploy invite-company-member
    supabase secrets set RESEND_API_KEY=YOUR_RESEND_API_KEY INVITE_FROM_EMAIL=YOUR_VERIFIED_SENDER APP_URL=https://project-hub-starter.vercel.app

The sender must be verified with Resend. The function checks that the caller is a company admin. Company invitations grant company membership only; they do not add the invitee to individual project's task/member permissions.

### Configure the 10 AM attendance WhatsApp message

1. Use an eligible WhatsApp Business Platform setup and Meta WhatsApp Groups API. The destination group ID must be from a group supported by that API; do not assume the ID of a normal existing WhatsApp group will work.
2. Deploy the scheduled sender and set its secrets server-side:

    supabase functions deploy send-attendance-digest --no-verify-jwt
    supabase secrets set CRON_SECRET=YOUR_RANDOM_SECRET WHATSAPP_ACCESS_TOKEN=YOUR_META_TOKEN WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID WHATSAPP_API_VERSION=YOUR_SUPPORTED_GRAPH_API_VERSION

3. In Supabase SQL Editor, edit supabase/company_attendance_cron.sql and replace the publishable/anon-key and cron-secret placeholders. Use the exact same random value as CRON_SECRET. Run the SQL once to store values in Vault and schedule the job.
4. In the active company's Attendance schedule tab, enter the group's name and API group ID, and enable daily delivery. Leave it disabled until credentials and the group destination have been verified.

Messages are sent individually per employee at approximately 10:00 AM India time: working employees are reported with check-in time and work location, leave entries as "Employee on leave", and missing check-ins as "Employee has not signed in yet". Check Supabase Edge Function logs and company_attendance_notification_runs for delivery status.

The daily sender uses the Meta Graph API version supplied in WHATSAPP_API_VERSION. Enter a currently supported version for the connected WhatsApp Business account. Missing credentials, group ID, or an inactive cron job prevents delivery; the UI does not claim a message was sent just because settings were saved.


## Update your local files safely

1. Back up your current `ProjectHubStarter` folder first.
2. Extract this ZIP to a new folder, or copy the updated source files over your existing project. Keep your own `.env.local` file separately.
3. Your `.env.local` should contain your existing Supabase Project URL and publishable/anon key:
   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
   ```
4. In the project folder run:
   ```
   npm.cmd install
   npm.cmd run dev
   ```
5. Open the local URL printed by Vite.

Do not share `.env.local` or any secret/service-role key. The archive intentionally excludes `.env.local` and `node_modules`.

## Role model

- **Owner/Main editor:** can add existing registered members, change member roles, remove other members, manage tasks and project settings.
- **Editor:** can manage tasks and update project work.
- **Commenter:** can view and comment.
- **Viewer:** can view only.

The database RLS policies are the actual security boundary. UI controls alone are not security. The existing base schema and this migration must both be applied to the same Supabase project.

## Build and hosting

The source is intended for Vite. Run `npm.cmd run build` on Windows to type-check and build. The included source passed TypeScript checking during preparation; a full production bundle could not be verified in the preparation environment because the uploaded `node_modules` contained Windows-specific optional native dependencies. Reinstall dependencies on your Windows machine before building.

To publish later, use a static host such as Cloudflare Pages and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in its environment variables. Add the deployed URL to Supabase Authentication → URL Configuration. Free tiers have quotas and can change.

## Database upgrades and future app updates

The SQL file `supabase/upgrade_features.sql` is a one-time additive migration for the included task and membership features. It creates the task table, indexes, row-level security policies, and a membership helper function. It does not drop tables, policies, or rows. Apply it once to the existing Supabase project before using those features.

Updating page layout, styles, or other frontend-only functionality does not require running SQL again. Future database-dependent features should use separate, versioned, additive migration files and only be applied when their corresponding feature requires them. Do not rerun this migration if it has already completed successfully; if it failed part-way, inspect the database state before retrying because this first-run script does not drop/recreate existing policies.


### Weekly assigned-work dashboard and individual WhatsApp messages

Apply supabase/weekly_work_dashboard.sql after the company and attendance migrations. It is additive: it adds assignee user IDs, daily status history, an admin-only company completion report, private employee WhatsApp contact numbers, and the server-side daily work digest query. It does not delete or rewrite any existing task/project data.

For tasks to appear under **Work assigned to you** or **Work you assigned**, assign them to an existing member in the task editor. Existing free-text assignee names are preserved but are not automatically converted to account IDs because names are not a reliable identity match. The assignee must already have access to the project. The dashboard uses Monday–Saturday and carries incomplete items forward in the current week. An unmarked past day is recorded as “Not started”; employees can update only their own daily status, while the “Work you assigned” view is read-only.

The company profile's weekly completion table is admin-only. Its percentage is completed assigned items divided by assigned items for that week, including unfinished overdue carryovers. Employee daily updates are stored separately from the existing project/task fields.

#### WhatsApp daily digest and 7 PM reminder

In Company Profile → Employees & admins, an admin must add each recipient's WhatsApp number in international E.164 format, e.g. +919876543210. Phone numbers are stored in a separate admin-only table and are not exposed to regular employees.

Deploy the function:

    supabase functions deploy send-daily-work-messages --no-verify-jwt

Configure these Supabase Edge Function secrets securely (do not commit tokens to GitHub):

    supabase secrets set CRON_SECRET=YOUR_RANDOM_SECRET WHATSAPP_ACCESS_TOKEN=YOUR_META_TOKEN WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID WHATSAPP_API_VERSION=YOUR_SUPPORTED_GRAPH_API_VERSION WHATSAPP_DAILY_TEMPLATE_NAME=YOUR_APPROVED_DAILY_TEMPLATE WHATSAPP_EVENING_TEMPLATE_NAME=YOUR_APPROVED_REMINDER_TEMPLATE WHATSAPP_TEMPLATE_LANGUAGE=en

Both Meta WhatsApp message templates must be approved and contain one body placeholder ({{1}}). The daily template receives a compact work list containing project, stage, task, and deadline; the evening template receives a reminder to update today's statuses. Outbound template messages require the recipient's opted-in number and appropriate Meta Business Platform configuration. A personal WhatsApp account alone is not sufficient.

Then edit supabase/company_attendance_cron.sql to replace the Supabase publishable/anon key and the same random cron secret as CRON_SECRET. Run the SQL in the Supabase SQL Editor. In addition to the existing 10:00 AM attendance schedule, it schedules the individual task digest at 08:00 and the schedule-update reminder at 19:00 Asia/Kolkata time. Re-running it replaces jobs with the same names.

No WhatsApp messages are sent until the migration is applied, the function is deployed, approved templates and secrets are configured, valid employee numbers are entered, and the cron schedules are installed and tested.
