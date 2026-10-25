# ProjectHub — collaboration starter (feature-upgraded)

ProjectHub is a responsive React + TypeScript + Supabase web app. This update adds a project task workflow, Kanban board, Gantt-style timeline, team role management for existing accounts, and appearance customisation. It is not a complete Bitrix24 clone and is not deployed publicly by this archive.

## Current features

- Supabase email/password sign-up and sign-in.
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

- **Email invitations for people who have not registered are not implemented.** The Team page can add existing accounts only. To email first-time invitations, configure a Supabase Edge Function (server-side) and email provider; never put a service-role key in the browser.
- Gantt is a lightweight timeline view, not a full dependency-aware scheduler. Task date editing and dependency links are not implemented yet.
- File storage, real-time chat, email/push notifications, recurring tasks, time tracking, CRM, automation rules, and a full activity/audit feed are not implemented in this release.
- Personalisation is saved in the current browser. It is not synced across devices yet.
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
