# NEXUS — Phase 1 Foundation

Goal: a real, persistent foundation — sign-in, roles, app shell, dashboard, and the full data model. No AI, no fake/mock behaviour.

## What you'll get

- Email + password sign-in and sign-up, plus Google sign-in.
- Three roles: Admin, Employee, Client. What a person sees depends on their role.
- App shell: collapsible left sidebar, top bar with notification bell (live unread count) and profile menu (name, role, sign out).
- Dashboard with real counts pulled from the database (projects, tasks, clients, recent activity). Empty states where there is no data yet — no invented numbers.
- Everything stored in the database, ready for Kanban, client portals, files, timelines and AI later.

## Database schema

Accounts live in the built-in auth system. Everything below links to them.

- **profiles** — one row per person: full name, avatar, job title, phone, optional link to a client company. Created automatically on sign-up.
- **user_roles** — separate table (roles are never stored on the profile, for security). One row per person per role: admin / employee / client.
- **clients** — client companies: name, industry, website, contact email/phone, status (active, prospect, archived), owner (an employee).
- **projects** — belongs to one client. Name, description, status (planning, active, on hold, completed, cancelled), priority, start/due dates, budget, project lead.
- **project_members** — which employees are on which project, and their project role (lead, member, viewer). Drives access.
- **tasks** — belongs to a project. Title, description, status (backlog, todo, in progress, review, done — Kanban-ready), priority, assignee, due date, position for ordering, optional parent task for subtasks.
- **comments** — threaded discussion attached to either a project or a task, with author, body, and an internal-only flag so clients don't see internal notes.
- **activity_events** — append-only audit/timeline: who did what, on which entity (project/task/client/comment), event type, details, timestamp. Feeds project timelines later.
- **notifications** — per person: type, title, body, link, read flag, timestamp. Written by database triggers on assignment, comments and status changes.

### Relationships

```text
auth user 1—1 profile
profile 1—* user_roles            (admin | employee | client)
profile *—1 clients               (client users belong to one company)
clients 1—* projects
projects 1—* tasks                tasks 1—* tasks (subtasks)
projects *—* profiles             via project_members
tasks/projects 1—* comments
any entity 1—* activity_events
profile 1—* notifications
```

### Access rules (enforced in the database, not just the UI)

- Admin: full access to everything.
- Employee: sees all clients/projects; can edit projects they lead or are a member of; can create tasks, comments, clients.
- Client: sees only their own company's projects and tasks, and only non-internal comments. Can comment; cannot change project or task data.
- Roles are checked through a dedicated security function so policies can't be bypassed or escalated.

## Pages in this phase

- `/` — public landing with sign-in call to action.
- `/auth` — sign in / sign up.
- `/dashboard` — role-aware overview (protected).
- `/projects`, `/clients`, `/tasks` — placeholder routes rendering the shell with an honest "coming next" empty state, so navigation is real rather than dead links. Admin-only `/settings` entry point.

## Technical notes

- Lovable Cloud enabled for database, auth, and row-level security. Email auth turned on; Google provider configured.
- Protected pages live under an `_authenticated` layout; admin-only areas behind a role-checked nested layout.
- `has_role(user_id, role)` security-definer function backs every RLS policy.
- Triggers: auto-create profile + default role on sign-up; write `activity_events` and `notifications` on task assignment, status change, and new comments.
- Data reads go through typed server functions and TanStack Query; no client-side data faking.
- Seed data: none invented. The first account to sign up can be promoted to Admin.

## Not in this phase

Kanban board interactions, file uploads, client portal views, AI requirement analysis — the schema anticipates them.
