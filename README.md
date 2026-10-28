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
