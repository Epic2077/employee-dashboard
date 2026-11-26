# Supabase setup

Everything needed to stand up the database lives in this folder: four
migrations (schema, booking rules/triggers, RLS, reference data) plus an
employee provisioning script.

## 1. Environment

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` on self-hosted)
- `SUPABASE_SERVICE_ROLE_KEY` — **server only**, used for provisioning and username login
- `EMPLOYEE_EMAIL_DOMAIN` — defaults to `staff.local`
- `XUI_BASE_URL` / `XUI_USERNAME` / `XUI_PASSWORD` — 3x-ui panel URL (e.g.
  `https://panel.example.com:2053`) and panel login, used only server-side to
  create/remove V2Ray clients. Without them the «کانفیگ» tab shows a setup notice.
- `XUI_SUB_BASE_URL` — optional public base for subscription links
  (`<base>/sub/<subId>`); falls back to `XUI_BASE_URL`.

## 2. Apply the migrations

A hosted project:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Local stack (requires Docker):

```bash
npx supabase start
npx supabase db reset
```

No CLI/network? Run the files in `supabase/migrations/` **in filename
order** in the dashboard SQL editor.

Order matters:

1. `*_init_lunch_schema.sql` — tables and the username normalizer
2. `*_lunch_functions_triggers.sql` — booking rules and auth trigger
3. `*_lunch_rls_policies.sql` — grants and row level security
4. `*_seed_reference_data.sql` — price, window and the weekly menu
5. `*_roles_and_admin.sql` — manager/admin/owner roles and reporting policies
6. `*_coffee_service.sql` — the original coffee settings/orders (superseded by
   step 8 but still needed by the services backfill)
7. `*_teams_and_permissions.sql` — teams (departments), `ceo` role,
   owner-editable role × capability matrix and scoped RLS
8. `*_services_catalog.sql` — `services` + `service_orders`, migrates the old
   coffee table and drops it
9. `*_lunch_day_management.sql` — `lunch.manage`: the day list and reserving
   food on behalf of an employee
10. `*_digital_configs.sql` — V2Ray configs, quotas and panel settings
    (`digital.manage`)
11. `*_layered_access_and_categories.sql` — replaces `role_permissions` with
    `access_grants` (roles, teams, team managers, people), adds the shared
    `access_categories` registry and wires category-aware services + lunch
12. `*_access_deny_precedence.sql` — final resolver functions: grants widen,
    team/manager denies narrow, person exceptions stay final

## 3. Create employee accounts

The app has no public signup. Accounts are created from a CSV:

```bash
cp supabase/seed/employees.example.csv supabase/seed/employees.csv
# fill in the real list, then:
npm run seed:employees
```

`supabase/seed/employees.csv` is gitignored. Columns:

| column             | meaning                                            |
| ------------------ | -------------------------------------------------- |
| `username`         | what the employee types at login — Persian is fine |
| `full_name`        | display name                                       |
| `employee_code`    | ASCII id, used to build `emp-<code>@<domain>`      |
| `department`       | optional                                           |
| `role`             | `employee`, `manager`, `ceo`, `admin` or `owner`   |
| `initial_password` | initial password, usually the employee number      |
| `phone`            | optional mobile number (stored in `user_metadata`) |

Re-running the script is safe (it updates existing accounts).
Use `-- --reset-password` to reset passwords to the CSV value and force a
password change on next login.

## 4. Roles

| role       | default access                                                |
| ---------- | ------------------------------------------------------------- |
| `employee` | lunch, services, config and directory sections + own records   |
| `manager`  | + team reports, team activity and team user list (`team`)      |
| `ceo`      | + read-only reports and user list for the whole company       |
| `admin`    | + `/admin/menu`, `/admin/services` and the day list           |
| `owner`    | everything, including users and the access console            |

Authorization lives in `auth.users.raw_app_meta_data.role` (mirrored on
`profiles.role`). Only the service role can change it, which is why role
assignment runs through a server action rather than RLS.

### Layered access (`access_grants`)

Scopes are `none | self | team | all`. Access resolves four layers, in order:

```
role grant ──▶ team grants ──▶ team-manager grants ──▶ person exception
```

- **Role** — the matrix on `/admin/permissions` (base for everyone with that role).
- **Team** — grants for the team a person belongs to (`profiles.department_id`).
- **Team manager** — grants for the team(s) where `departments.manager_id = user`.
  Being assigned as a manager is enough; the profile role can stay `employee`.
  New teams are seeded with the current `manager` role grants (and existing
  teams without manager grants are backfilled), so a new manager immediately
  gets team reports and team activity. The owner can then edit or deny them.
- **Person** — an explicit exception. `mode = 'grant'` sets the scope (can widen
  or narrow), `mode = 'deny'` forces `none`.

Grants in the first three layers widen the result (widest scope wins). A
`deny` in a team or team-manager layer **overrides** the broader result, which is
how a team or its manager can be restricted below the role default. The person
exception is checked last and can allow or deny. Owners always resolve to `all`
and cannot be locked out.

Default role matrix (owner is always `all`):

| capability | employee | manager | ceo | admin |
| --- | --- | --- | --- | --- |
| `lunch.view` / `services.view` / `config.view` / `directory.view` | all | all | all | all |
| `reports.lunch` / `reports.services` | none | team | all | all |
| `team.activity` | none | team | all | all |
| `users.view` | none | team | all | none |
| `menu.manage` / `lunch.manage` / `services.manage` | none | none | none | all |
| `digital.manage` | none | team | none | all |
| `users.manage` / `permissions.manage` / `teams.manage` | none | none | none | none |

Category-aware capabilities (`lunch.view`, `menu.manage`, `reports.lunch`,
`services.view`, `services.manage`, `reports.services`) accept an extra
`category_id`.

Management pages (owner only by default):

| page | what it edits |
| --- | --- |
| `/admin/permissions` | role matrix + category registry |
| `/admin/permissions/teams/[id]` | team settings, member grants, manager grants, per-category allow/deny |
| `/admin/permissions/people/[id]` | person exceptions and the effective-access preview |

SQL helpers: `effective_scope(cap, category_id, user_id)`,
`capability_scope(cap)`, `category_scope(cap, category_id)`,
`has_capability(cap)`, `has_full_capability(cap)` (all policy-facing),
`my_effective_access()`, `effective_access_for(user_id)`,
`team_department_ids()`, `can_view_user(user_id, cap)`, `can_view_service`,
`can_order_service` and `lunch_day_category(date)`. The app mirrors the
defaults in `lib/auth/scopes.ts`, so everything keeps working before this
migration is applied.

### Data categories (`access_categories`)

Categories live in one registry (`module`, `slug`, `name`, `sort_order`,
`is_active`) and are referenced from `services.category_id`,
`weekly_menu.category_id` and `menu_overrides.category_id`. A missing category
grant means “follow the capability scope”; a category grant/deny overrides it
for that row. RLS enforces the result for listing, ordering, booking and
reports.

Adding a category-aware module later:

1. Add a `category_id uuid references public.access_categories (id)` column to
   the module's table.
2. Add the module key to `lib/auth/scopes.ts` (`CATEGORY_MODULES` and
   `CATEGORY_MODULE_LABELS`), and insert the module's capabilities into
   `access_capabilities` with `category_module = '<module>'`.
3. Gate reads/writes with `public.category_scope('<capability>', category_id)`
   (or `can_view_category`); the owner console picks the new module up
   automatically.

### Teams (`departments`)

`departments(name, manager_id)` groups employees for `scope = team`.
`profiles.department_id` points at a team and is backfilled from the old
free-text `profiles.department`. A manager who manages no team falls back to
their own text department.

Bootstrap the first owner: apply `*_roles_and_admin.sql`, set the account's
role to `owner` in `supabase/seed/employees.csv`, then run the provisioning
script again (it updates existing users), and sign out/in so the JWT carries
the new claim:

```csv
username,full_name,employee_code,department,role,initial_password
اشکان صادقی,اشکان صادقی,100101,فناوری اطلاعات,owner,100101
```

```bash
npm run seed:employees
```

Pure-SQL alternative:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"owner"}'::jsonb
where email = 'emp-100101@staff.local';

update public.profiles set role = 'owner' where email = 'emp-100101@staff.local';
```

After that, the owner promotes everyone else on `/admin/users`. Role changes
require the affected user to sign out and back in (JWT claims are cached).

## 5. Booking rules

Encoded in `public.can_reserve(date)` and mirrored in the UI:

- open from `today + min_lead_days` (default 1, so today is closed)
- open until `today + max_advance_days` (default 14)
- never Friday (`service_weekday = 6`)
- never a date marked `is_closed` in `menu_overrides`
- only when a menu exists (override row or enabled weekly row)
- cancelling is allowed from today onward

Tune the window without deploying:

```sql
update public.app_settings
set min_lead_days = 1, max_advance_days = 14
where id = 1;
```

## 6. Services (coffee, tea, …)

Every perk the company provides lives in `services`, and daily orders live in
`service_orders` (one row per employee, service and day, price snapshotted per
unit). Employees order from the «سرویس‌ها» tab; orders are **today only**.

- `services`: `slug`, `name`, `unit_label`, `price_irt`, `max_per_day`,
  `is_active`, `sort_order`
- `prepare_service_order()` enforces today-only, the daily cap, an active
  service, and always copies the catalogue price
- Managers see `reports.services` scoped to their team; admins/owners manage
  the catalogue on `/admin/services`

Add a service (or use the form on `/admin/services`):

```sql
insert into public.services (slug, name, unit_label, price_irt, max_per_day, sort_order)
values ('tea', 'چای', 'لیوان', 15000, 5, 20);
```

`*_services_catalog.sql` moves any rows from the old `coffee_orders` table into
`service_orders` and then drops it, so the coffee history survives.

## 7. Day list & Excel export

`/admin/daily` is the page for whoever handles lunch that day:

- shows every employee in scope (team for managers, everyone for admins) with
  their reservation status for the selected day
- with `lunch.manage`, staff can reserve or cancel food for any employee; the
  booking window (`can_reserve`) still applies
- refreshes itself every 20 seconds and can export the list as CSV that opens
  directly in Excel (UTF-8 BOM, Persian headers) via
  `/admin/daily/export?d=YYYY-MM-DD`

## 8. Colleague directory

`/directory` lists every active employee with unit, role and phone (read from
`auth.users` metadata by the server), marks the viewer's teammates, and has a
search box. It is available to every signed-in user, which is why it uses the
service role server-side instead of relaxing the `profiles` RLS policies.

## 9. Digital configs (V2Ray)

Employees get a V2Ray subscription on the company's 3x-ui panel; the tab is
«کانفیگ» (`#config`). The panel client name is the employee's full name.

- `v2ray_configs` — one row per panel client (`client_id`, `sub_id`, `email`,
  `inbound_ids`, `status`). Several rows per person when their quota allows.
- `v2ray_quotas` — how many configs a user may own (default 1). Managers can
  raise it for their team up to `digital_settings.manager_quota_cap`; the owner
  is unlimited.
- `digital_settings` — default inbounds for employees, self-service toggle,
  manager quota cap, optional subscription base URL.
- Creating a config logs into the panel, adds the same client (uuid + subId) to
  each chosen inbound, then records the row; any panel failure rolls back the
  clients it already added.
- Node choice: full-scope staff (`digital.manage = all`, i.e. owner/admin) can
  pick specific inbounds or all of them; everyone else uses the configured
  defaults, falling back to every enabled inbound.
- The subscription link is `<XUI_SUB_BASE_URL or XUI_BASE_URL>/sub/<subId>`.
- Writes always run server-side with the service role; RLS only exposes the
  rows the viewer may see (own rows or the `digital.manage` scope).
- `/admin/config` lists configs in scope, creates/revokes them, edits quotas and
  the panel defaults.

## 10. Verify

```sql
select public.can_reserve(current_date);          -- false
select public.can_reserve(current_date + 1);      -- true
select public.can_reserve(current_date + 14);     -- true
select public.can_reserve(current_date + 15);     -- false
select * from pg_policies where schemaname = 'public';
```

Layered access checks (run in the SQL editor as `postgres`; replace the ids):

```sql
-- effective scope for a specific person (owner bypass, role, team, manager, person)
select public.effective_scope('reports.lunch', null, '<user-uuid>');
select public.effective_scope('services.view', '<category-uuid>', '<user-uuid>');

-- person exception beats a team deny
insert into public.access_grants (subject_type, user_id, capability, mode, scope)
values ('user', '<user-uuid>', 'lunch.view', 'deny', 'none');

-- team deny narrows the role baseline
insert into public.access_grants
  (subject_type, department_id, capability, mode, scope)
values ('team', '<team-uuid>', 'services.view', 'deny', 'none');

-- owner is always all
select public.effective_scope('permissions.manage', null, '<owner-uuid>');
```

Also confirm the seeded defaults survived the migration:

```sql
select role, capability, scope
from public.access_grants
where subject_type = 'role' and role = 'manager'
order by capability;
```

## Notes

- Authorization uses `app_metadata.role`, never `user_metadata` (user editable).
- Profile and reservation reads are scoped by `can_view_user`: everyone sees
  their own rows, a `team` scope covers the teams the user manages **and** their
  own team, and `all` covers the whole company.
- Service orders follow the same scoping, so the reports can aggregate while
  each employee only sees their own orders. A denied category is filtered in
  both the catalogue and the reports.
- Role changes still require a new sign-in (JWT claims are cached), while team
  membership, team grants and person exceptions apply on the next request.
- `profiles` only lets employees update `full_name`, `avatar_url` and
  `department`; usernames and the `must_change_password` flag are only writable
  by the service role (the change-password action clears the flag server-side).
- `access_grants`, `access_categories` and `access_capabilities` are readable by
  permission managers; `effective_access_for` refuses to reveal another person's
  scopes unless the caller has `permissions.manage = all`.
- Initial passwords must be at least 6 characters (Supabase Auth minimum), so
  employee numbers shorter than that need a prefix or a longer code.
- `resolve_login_email` is callable by `service_role` only.
- Phone/OTP auth is not enabled: self-hosted GoTrue supports it, but it needs
  an SMS provider configured in `supabase/config.toml` and the environment.
- Regenerate types with `npm run db:types` after linking a project; the
  hand-written `lib/supabase/types.ts` can then be diffed/replaced.
