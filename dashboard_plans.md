# Dashboard Expansion Plan — برنامه توسعه داشبورد

> Bilingual roadmap: English structure, Persian feature names. Edit this file
> freely — change priorities, move features between phases, or add new ones.
> The phases below are the build order the implementation will follow.

**Status:** draft for review · **Last updated:** initial draft
**Legend:** P0 = must-have first · P1 = high value · P2 = later/nice-to-have
**Availability:** All teams = everyone gets it · Opt-in = enabled per team via a feature toggle · Dev teams = meant for technical teams (e.g. IT)

---

## 1. Purpose & guiding principles — هدف و اصول

The dashboard grows from an employee-services app into a **work management
hub**: Trello-like boards and tasks for every team, Jira-like extras for
technical teams that need them, GitHub activity monitoring, a call-center
track list with client call history, and analytics for managers and members.

Principles:

1. **Simple by default.** Every team gets an easy, Trello-like board and
   backlog. No one is forced into sprints or epics.
2. **Power features are opt-in per team.** A `team_features` table lets the
   owner enable Jira-like features (sprints, burndown, epics) only for teams
   like IT, while other teams keep the simple experience.
3. **One permission model.** All new modules reuse the existing layered access
   (roles / teams / team managers / person exceptions, plus data categories).
   New capabilities only — no parallel permission system.
4. **Ship in phases.** Each phase is independently usable and verifiable.
5. **Managers see their team, members see themselves.** Every report respects
   the existing `self | team | all` scopes.

---

## 2. Per-team feature toggles — فعالسازی امکانات برای هر تیم

Trello-like basics (projects, boards, cards, simple backlog) are on for every
team by default. Everything heavier is toggled per team.

Proposed design (built in Phase 6):

- Table `team_features(team_id uuid, feature_key text, enabled boolean)`,
  primary key `(team_id, feature_key)`.
- The owner console (`/admin/permissions/teams/[id]`) gets a «امکانات تیم»
  section listing all toggleable features with on/off switches.
- The UI hides disabled features completely (sidebar, project menu, card
  fields), so non-technical teams never see them.

Toggleable features:

| feature_key | Feature — ویژگی | Phase |
| --- | --- | --- |
| `sprints` | Sprint boards & planning — برد و برنامه‌ریزی اسپرینت | 7 |
| `burndown` | Burndown & velocity — نمودار پیشرفت اسپرینت | 7 |
| `epics` | Epics & story hierarchy — اپیک و داستان‌ها | 8 |
| `story_points` | Sprint points & velocity — امتیاز و سرعت اسپرینت (simple effort points exist for everyone, see A17) | 7 |
| `time_tracking` | Time tracking — ثبت زمان | 15 |
| `git` | GitHub monitoring — مانیتورینگ گیت | 9 |
| `call_center` | Call center — مرکز تماس | 12 |
| `analytics` | Analytics dashboards — داشبوردهای تحلیل | 14 |
| `templates` | Board/project templates — قالب‌ها | 15 |

---

## 3. New capabilities — دسترسی‌های جدید

Added to `access_capabilities` and `lib/auth/scopes.ts` in the relevant phase.
All of them work with the existing grants (role / team / team-manager / person)
and scopes `none | self | team | all` unless noted.

| capability | Label — عنوان | Phase | Notes |
| --- | --- | --- | --- |
| `projects.view` | مشاهده پروژه‌ها | 1 | members see their projects |
| `projects.manage` | مدیریت پروژه‌ها | 1 | create/archive, `none/all` only |
| `tasks.view` | مشاهده وظایف | 2 | boards and cards |
| `tasks.manage` | مدیریت وظایف | 3 | move/edit/delete cards, `none/all` only |
| `sprints.manage` | مدیریت اسپرینت | 7 | dev teams, `none/all` only |
| `clients.view` | مشاهده مشتریان | 12 | call-center CRM |
| `clients.manage` | مدیریت مشتریان | 12 | `none/all` only |
| `calls.view` | مشاهده تماس‌ها | 12 | per agent / team / all |
| `calls.manage` | ثبت و ویرایش تماس | 12 | `none/all` only |
| `git.view` | مشاهده فعالیت گیت | 10 | commits/PRs of repos in scope |
| `git.manage` | اتصال مخازن گیت | 9 | connect repos, manage tokens, `none/all` |
| `analytics.view` | مشاهده تحلیل‌ها | 14 | self / team / all |

---

## 4. Feature catalogue — فهرست امکانات

### A. Task & project management (Trello-like core) — مدیریت پروژه و وظایف

Default for **all teams**.

| # | Feature — ویژگی | Description | Availability | Phase | Priority |
| --- | --- | --- | --- | --- | --- |
| A1 | Projects — پروژه‌ها | Create a project with name, color, icon, description and members; archive instead of delete. | All teams | 1 | P0 |
| A2 | Project members — اعضای پروژه | Add individual members or a whole team to a project; member list visible to project viewers. | All teams | 1 | P0 |
| A3 | Boards — بردها | One or more Kanban boards per project, each with custom columns. | All teams | 2 | P0 |
| A4 | Columns — ستون‌ها | Add, rename, reorder and delete columns; optional WIP limit per column. | All teams | 2 | P1 |
| A5 | Cards — کارت‌ها | Card basics: title, markdown description, assignee(s). Priority, deadlines, points and labels are A15–A18. | All teams | 3 | P0 |
| A6 | Checklists — چک‌لیست | Checkable subtask list on a card with progress bar. | All teams | 3 | P1 |
| A7 | Drag & drop — جابه‌جایی | Move cards between columns with dnd-kit (already in the project); every move is logged. | All teams | 2 | P0 |
| A8 | Comments — نظرات | Comment threads on cards, @mentions of team members. | All teams | 4 | P1 |
| A9 | Attachments — پیوست‌ها | File upload per card via Supabase Storage with size limit. | All teams | 4 | P1 |
| A10 | Activity history — تاریخچه فعالیت | Per-card change log: who moved/edited/assigned it and when. | All teams | 4 | P1 |
| A11 | Simple backlog — بک‌لاگ ساده | Every project has a backlog board/column; triage and rank cards by dragging. | All teams | 5 | P0 |
| A12 | Search & filters — جستجو و فیلتر | Search across projects; filter by assignee, label, priority, due date. | All teams | 5 | P1 |
| A13 | Recurring cards — وظایف تکرارشونده | Daily/weekly checklists (e.g. kitchen duty, backups) that re-open automatically. | All teams | 15 | P2 |
| A14 | My tasks view — وظایف من | A personal «وظایف من» page across all projects for every user, sorted by deadline and priority. | All teams | 3 | P0 |
| A15 | Priority system — سیستم اولویت | Priority levels (کم، معمولی، زیاد، فوری) with colored badges; sort and filter by priority; high-priority cards highlighted. | All teams | 3 | P0 |
| A16 | Deadlines — مهلت‌ها | Due date (and optional time) per card; overdue and due-today indicators, deadline sorting, «امروز» / «عقب‌افتاده» chips. | All teams | 3 | P0 |
| A17 | Effort points — امتیاز وظیفه | Simple effort estimate on every card (1/2/3/5/8), summed per member and column; feeds workload analytics later. | All teams | 3 | P1 |
| A18 | Labels — برچسب‌ها | Colored labels defined per project, applied to cards, filterable and searchable. | All teams | 3 | P1 |

### B. Jira-like extras for technical teams — امکانات پیشرفته برای تیم‌های فنی

**Opt-in per team** via feature toggles.

| # | Feature — ویژگی | Description | Availability | Phase | Priority |
| --- | --- | --- | --- | --- | --- |
| B1 | Team feature toggles — فعال‌سازی امکانات تیم | The `team_features` table and its owner-console section. | Foundation | 6 | P0 |
| B2 | Sprint boards — برد اسپرینت | Create a sprint with start/end dates and a goal; a sprint board is generated from the backlog. | Opt-in | 7 | P0 |
| B3 | Sprint planning — برنامه‌ریزی اسپرینت | Move backlog cards into a sprint, estimate story points, see total. | Opt-in | 7 | P1 |
| B4 | Burndown & velocity — نمودار پیشرفت | Burndown chart per sprint; velocity = completed points per sprint. | Opt-in | 7 | P1 |
| B5 | Sprint points & velocity — امتیاز و سرعت اسپرینت | Use the A17 effort points in sprint planning and velocity charts (dev teams). | Opt-in | 7 | P2 |
| B6 | Epics — اپیک‌ها | Epic → stories/cards hierarchy with an epic progress bar. | Opt-in | 8 | P2 |
| B7 | Subtasks — زیروظایف | Structured subtasks with assignee and status, beyond checklists. | Opt-in | 8 | P1 |
| B8 | Release notes — یادداشت انتشار | Auto-generated release notes from cards done in a sprint. | Opt-in | 8 | P2 |

### C. GitHub monitoring — مانیتورینگ گیت‌هاب

**Opt-in per team**, repos are selected per project/team.

| # | Feature — ویژگی | Description | Availability | Phase | Priority |
| --- | --- | --- | --- | --- | --- |
| C1 | Repository connection — اتصال مخازن | Connect GitHub orgs/repos with a fine-grained PAT or GitHub App (server-side only); pick repos per team/project. | Opt-in | 9 | P0 |
| C2 | Commit feed — فید کامیت‌ها | Ingest commits (webhooks preferred, polling fallback); list per repo and per member with diff summary. | Opt-in | 10 | P0 |
| C3 | PR monitoring — پول‌ریکوئست‌ها | Open/merged/closed PRs, review requests and review latency per repo. | Opt-in | 10 | P0 |
| C4 | Member git activity — فعالیت گیت اعضا | Commits and PRs per member shown in their profile, team activity page and analytics. | Opt-in | 10 | P0 |
| C5 | Task ↔ PR linking — اتصال وظیفه و PR | Auto-link from branch names / task keys, manual linking; merging a linked PR moves the card to done. | Opt-in | 11 | P1 |
| C6 | GitHub issues sync — همگام‌سازی ایشوها | Map GitHub issues to cards (one-way import first, two-way optional). | Opt-in | 11 | P2 |
| C7 | Repo health — سلامت مخزن | Open-PR age, failing checks badge on the repo card. | Opt-in | 11 | P2 |

### D. Call center — مرکز تماس و پیگیری مشتریان

**Opt-in per team** (designed so several teams can each run their own call
lists without seeing each other's clients).

| # | Feature — ویژگی | Description | Availability | Phase | Priority |
| --- | --- | --- | --- | --- | --- |
| D1 | Clients — مشتریان | Light CRM separate from the employee directory: name, company, phone(s), email, tags, source. | Opt-in | 12 | P0 |
| D2 | Manual call log — ثبت تماس دستی | Agent logs a call: client, direction (in/out), time, duration, result and free-text description. | Opt-in | 12 | P0 |
| D3 | Call results — نتایج تماس | Configurable outcomes (answered, callback, no answer, busy, converted, complaint…) per team. | Opt-in | 12 | P0 |
| D4 | Track lists — لیست پیگیری | Client call queue with assignee, due date, priority and status; the "list of clients to call today". | Opt-in | 12 | P0 |
| D5 | Client call history — تاریخچه تماس مشتری | Full timeline per client: every call with result and description. | Opt-in | 12 | P0 |
| D6 | Follow-ups — پیگیری بعدی | Set the next-call date on a client; upcoming follow-ups dashboard with reminders. | Opt-in | 12 | P1 |
| D7 | CDR import — ورود خودکار تماس | Import call records from a PBX (3CX/Asterisk CDR…), match numbers to clients automatically, agents enrich the result later. | Opt-in | 13 | P1 |
| D8 | Call KPIs — شاخص‌های تماس | Calls per agent/client, outcome distribution, conversion, call-back rate. | Opt-in | 14 | P1 |

### E. Analytics & reports — تحلیل و گزارش مدیران و کاربران

Available to everyone with `analytics.view`; scopes keep members at `self` and
managers at `team`.

| # | Feature — ویژگی | Description | Availability | Phase | Priority |
| --- | --- | --- | --- | --- | --- |
| E1 | Member activity — فعالیت اعضا | Combined timeline of card moves, comments, commits, PRs and calls per member, with a daily heatmap. | All teams | 14 | P0 |
| E2 | Project progress — پیشرفت پروژه | Throughput, cycle time, lead time, aging blockers per board. | All teams | 14 | P0 |
| E3 | Team workload — حجم کار تیم | Cards per member, overdue count, due-this-week list; helps managers balance work. | All teams | 14 | P1 |
| E4 | Call KPIs — شاخص‌های تماس | Calls/day per agent, outcomes, conversion and call-back rate (from D). | Opt-in | 14 | P1 |
| E5 | Git KPIs — شاخص‌های گیت | Commits/week, PR throughput, review latency per member and repo (from C). | Opt-in | 14 | P1 |
| E6 | Manager reports — گزارش مدیران | Team dashboards with the metrics above; CSV export. | All teams | 14 | P0 |
| E7 | Personal analytics — تحلیل فردی | Every user sees their own stats; managers see their team's. | All teams | 14 | P2 |

### F. Cross-cutting — زیرساخت مشترک

| # | Feature — ویژگی | Description | Phase | Priority |
| --- | --- | --- | --- | --- |
| F1 | Notifications — اعلان‌ها | In-app feed: mentions, assignments, due dates, PR reviews. | 15 | P1 |
| F2 | Audit log — تاریخچه مدیریتی | Who changed permissions, toggles, projects and clients. | 15 | P2 |
| F3 | Storage — فضای پیوست | Supabase Storage bucket for card attachments with quotas. | 4 | P1 |
| F4 | Templates — قالب‌ها | Board and project templates (e.g. «تیم فروش», «IT sprint»). | 15 | P2 |

---

## 5. Phases — فازها

Each phase is independently shippable. Suggested migration names are examples;
the real files follow the `YYYYMMDDHHMMSS_name.sql` convention.

### Phase 1 — Projects foundation — پایه پروژه‌ها
- **Goal:** projects exist and members can see them.
- **Features:** A1, A2.
- **Deliverables:** migration `projects_core.sql` (`projects`,
  `project_members`, RLS via grants); `lib/data/projects.ts`;
  `/projects` list + create dialog; sidebar section «کار و پروژه‌ها».
- **Capabilities:** `projects.view`, `projects.manage`.
- **Depends on:** layered access (done).
- **Verify:** owner creates a project, adds two members; a member sees only
  their projects; RLS blocks reading others' projects.

### Phase 2 — Boards & columns — بردها و ستون‌ها
- **Goal:** Kanban boards with drag & drop columns.
- **Features:** A3, A4, A7.
- **Deliverables:** `boards_columns.sql` (`boards`, `board_columns`,
  policies); board page with dnd-kit column reordering.
- **Capabilities:** `tasks.view`.
- **Depends on:** Phase 1.
- **Verify:** create a board with columns, reorder persists, WIP limit shown.

### Phase 3 — Cards core — هسته کارت‌ها
- **Goal:** tasks with assignees, due dates, priority, labels and checklists.
- **Features:** A5, A6, A14, A15, A16, A17, A18.
- **Deliverables:** `cards.sql` (`cards`, `card_assignees`, `card_labels`,
  `card_checklists`, priority/due/points columns, policies); card modal with
  priority, deadline, points and label pickers; «وظایف من» page sorted by
  deadline and priority.
- **Capabilities:** `tasks.manage`.
- **Depends on:** Phase 2.
- **Verify:** create/move/assign a card with priority, deadline, points and
  labels; overdue badge appears after the due time; personal list updates;
  RLS: a member cannot move a card in a project they are not in.

### Phase 4 — Comments, attachments, activity — نظرات، پیوست‌ها، تاریخچه
- **Goal:** collaboration on cards.
- **Features:** A8, A9, A10, F3.
- **Deliverables:** `card_activity.sql` (`card_comments`,
  `card_attachments`, `card_events`); Supabase Storage bucket; activity tab.
- **Capabilities:** none new.
- **Depends on:** Phase 3.
- **Verify:** comment with mention notifies; file upload/download works;
  every move appears in history.

### Phase 5 — Simple backlog & search — بک‌لاگ ساده و جستجو
- **Goal:** every team can triage work without touching sprints.
- **Features:** A11, A12.
- **Deliverables:** default backlog column per board; global search page;
  filters by assignee/label/priority/due.
- **Capabilities:** none new.
- **Depends on:** Phase 3.
- **Verify:** drag cards from backlog into a working column; search finds a
  card by title and label.

### Phase 6 — Team feature toggles — فعال‌سازی امکانات تیم
- **Goal:** teams choose how much complexity they want.
- **Features:** B1.
- **Deliverables:** `team_features.sql`; owner-console section in
  `/admin/permissions/teams/[id]`; a shared `hasTeamFeature(teamId, key)`
  helper used by later phases.
- **Capabilities:** none new (owner-only writes).
- **Depends on:** Phase 5.
- **Verify:** enable `sprints` for IT; IT members see sprint UI, sales does not.

### Phase 7 — Sprints & burndown — اسپرینت و نمودار پیشرفت
- **Goal:** Scrum for teams that want it.
- **Features:** B2, B3, B4, B5.
- **Deliverables:** `sprints.sql` (`sprints`, `sprint_cards`); sprint board,
  planning view, burndown chart (recharts already installed).
- **Capabilities:** `sprints.manage`.
- **Depends on:** Phase 6.
- **Verify:** start a sprint, move cards, burndown updates; velocity per sprint.

### Phase 8 — Epics & subtasks — اپیک‌ها و زیروظایف
- **Goal:** hierarchy for large pieces of work.
- **Features:** B6, B7, B8.
- **Deliverables:** `epics.sql` (`epics`, `card_parent_id`, epic progress);
  release-notes generator.
- **Capabilities:** none new.
- **Depends on:** Phase 7.
- **Verify:** epic progress reflects child card status; release notes list
  done cards of a sprint.

### Phase 9 — GitHub connection — اتصال گیت‌هاب
- **Goal:** connect repositories safely.
- **Features:** C1.
- **Deliverables:** `github_repos.sql` (`github_connections`,
  `github_repos`); settings page for org/PAT (service-role encrypted at rest),
  repo picker per team/project; webhook receiver route with a shared secret.
- **Capabilities:** `git.manage`.
- **Depends on:** Phase 6.
- **Verify:** connect a repo, webhook ping accepted, repo appears for the team.

### Phase 10 — Commits & PR monitoring — کامیت‌ها و پول‌ریکوئست‌ها
- **Goal:** member git activity is visible in the dashboard.
- **Features:** C2, C3, C4.
- **Deliverables:** `github_events.sql` (`github_commits`,
  `github_pull_requests`, `github_reviews`); per-repo and per-member pages;
  entries in the team activity feed.
- **Capabilities:** `git.view`.
- **Depends on:** Phase 9.
- **Verify:** a push appears within seconds (webhook) or on poll; commits
  attributed to the right member by email.

### Phase 11 — Task ↔ PR linking & issues — اتصال وظیفه و ایشوها
- **Goal:** code work and task work become one timeline.
- **Features:** C5, C6, C7.
- **Deliverables:** `github_links.sql` (`card_github_links`); branch-name
  parsing (e.g. `TASK-42`), manual link UI, merge→done automation; issue
  import (one-way) with mapping rules.
- **Capabilities:** none new.
- **Depends on:** Phase 10.
- **Verify:** branch `TASK-42/fix` auto-links; merging its PR moves the card;
  imported issue becomes a card in the chosen project.

### Phase 12 — Call center: clients & manual calls — مرکز تماس
- **Goal:** track clients, calls and follow-ups by hand.
- **Features:** D1–D6.
- **Deliverables:** `call_center.sql` (`clients`, `calls`, `call_track_lists`,
  `call_results` settings); «مرکز تماس» section: client list, client page with
  history, today's track list, call log form.
- **Capabilities:** `clients.view/manage`, `calls.view/manage`.
- **Depends on:** Phase 6.
- **Verify:** log a call with result and description; it appears on the
  client's history and the agent's list; teams cannot see each other's clients.

### Phase 13 — PBX/CDR import — ورود خودکار تماس از سانترال
- **Goal:** calls arrive automatically and agents only enrich them.
- **Features:** D7.
- **Deliverables:** `call_imports.sql`; a CDR ingester with a provider adapter
  (3CX/Asterisk first), number→client matching, unmatched-call inbox.
- **Capabilities:** none new.
- **Depends on:** Phase 12 (and the PBX provider decision, see §6).
- **Verify:** a test CDR file produces calls matched to clients; unmatched
  numbers land in the inbox for assignment.

### Phase 14 — Analytics suite — داشبورد تحلیل
- **Goal:** managers and members understand the work.
- **Features:** E1–E7, D8, C-KPIs.
- **Deliverables:** `analytics_views.sql` (or PostgREST-safe views);
  `/analytics` with member activity, project progress, workload, call KPIs and
  git KPIs; CSV export.
- **Capabilities:** `analytics.view`.
- **Depends on:** Phases 3, 10, 12 (panels render only for enabled modules).
- **Verify:** a manager sees only team-scoped numbers; owner sees all; export
  opens in Excel.

### Phase 15 — Notifications, templates & polish — اعلان‌ها و تکمیل
- **Goal:** day-to-day usability.
- **Features:** F1, F2, F4, A13.
- **Deliverables:** `notifications.sql` (`notifications`, in-app feed bell);
  audit-log table; board templates; recurring cards.
- **Capabilities:** none new.
- **Depends on:** Phase 4 (attachments/storage), Phase 5.
- **Verify:** mention triggers a notification; audit log records a permission
  change; a template creates a board with default columns.

---

## 6. Open questions & decisions needed — سوالات باز

1. **PBX provider** — which phone system (3CX, Asterisk, other) and version,
   so Phase 13 can build the right CDR adapter and number-matching rules.
2. **GitHub setup** — GitHub Cloud or Enterprise? One org or several?
   Fine-grained PAT per repo vs a GitHub App (recommended for webhooks)?
   Webhooks need a publicly reachable URL for the dashboard.
3. **Issue sync direction** — GitHub issues → dashboard cards only (safe), or
   two-way (risk of loops)?
4. **Email** — provider for optional email notifications (or keep in-app only).
5. **Attachment limits** — storage quota per card/project.
6. **Which teams get what** — initial `team_features` settings per team (e.g.
   IT: sprints + git; sales: call_center; others: default).

---

## 7. How to edit this file — راهنمای ویرایش

- **Add a feature:** add a row in the matching §4 table (A–F) with its
  capability keys, phase and priority.
- **Reprioritize:** change the Priority cell (P0/P1/P2) or move the feature
  row's Phase number.
- **Change phases:** edit §5 directly — each phase lists its features by their
  A–F ids, so keep those ids consistent.
- **Mark a phase as delivered:** add ✅ before the phase title and update the
  change log below.
- **New capabilities:** list them in §3 first so phases can reference them.

## 8. Change log — تاریخچه تغییرات

| Date | Change — تغییر |
| --- | --- |
| 2026-11-26 | Initial draft — پیش‌نویس اولیه |
| 2026-11-26 | Added explicit priority system, deadlines, effort points and labels to the task list (A15–A18) and Phase 3 — افزودن اولویت، مهلت، امتیاز و برچسب به فهرست وظایف |