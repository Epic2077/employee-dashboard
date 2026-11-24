# Plan — Supabase Auth + Lunch Backend

Status: **implemented** (pending `npm run build` / live-database verification).

Goal: replace every hardcoded value in the lunch dashboard (user, menu, price,
reservations) with real Supabase data, and add username/password auth for
pre-provisioned employees.

## Decisions

- **Accounts:** created by admins from a CSV; no public signup. Login takes the
  employee username (Persian allowed), stored as `profiles.username` plus a
  unique normalized `username_key`. A synthetic ASCII email
  (`emp-<employee_code>@<domain>`) is what Supabase Auth actually stores.
- **Username → email lookup:** server-side only, via
  `resolve_login_email(...)` executed with the service-role key. The anon key
  cannot enumerate employees.
- **Password:** initial password comes from the CSV (the employee number).
  `profiles.must_change_password` forces `/change-password` on first login.
  Usernames are immutable (column-level grants).
- **Phone/OTP auth:** not enabled — self-hosted GoTrue supports it but requires
  an SMS provider. The identifier layer is isolated so this can be swapped.
- **Roles:** `employee` / `admin` stored in JWT `app_metadata.role` (mirrored on
  `profiles.role`) so RLS never has to trust `user_metadata`.
- **Booking window:** rolling; open from `today + 1` through `today + 14`,
  Fridays and closed dates excluded. Enforced in SQL (`can_reserve`) and UI.
- **Menu model:** weekday template (`weekly_menu`, 0 = Sat … 6 = Fri) plus
  per-date `menu_overrides`.
- **Dates:** Postgres `date` (Tehran calendar day) converted with the existing
  Persian calendar helpers.
- **Cancelling:** allowed from today onward (hard delete).
- **Price:** snapshotted per reservation (`price_irt`) on insert.

## Delivered

### Database (`supabase/`)

| file                                        | contents                                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/…_init_lunch_schema.sql`        | `normalize_username()`, `profiles`, `app_settings`, `weekly_menu`, `menu_overrides`, `lunch_reservations`                                    |
| `migrations/…_lunch_functions_triggers.sql` | `today_tehran`, `service_weekday`, `is_admin`, `can_reserve`, `resolve_login_email`, auth-user trigger, price trigger, `updated_at` triggers |
| `migrations/…_lunch_rls_policies.sql`       | anon lockdown, column-level grants, owner-or-admin policies                                                                                  |
| `migrations/…_seed_reference_data.sql`      | price/window row and the six weekday meals                                                                                                   |
| `seed/employees.example.csv`                | provisioning template                                                                                                                        |
| `README.md`                                 | setup, migration order, provisioning, verification                                                                                           |

### App

- `lib/supabase/{client,server,admin,proxy,types,models,env}.ts`
- `proxy.ts` — Next 16 proxy (not `middleware.ts`) refreshing the session with
  `getClaims()` and guarding every route except `/login`.
- `lib/auth/session.ts` — `getClaims`, `requireUser`, `getCurrentProfile`
  (`use cache: private`).
- `app/login/*` — username/password form (`useActionState`), server action.
- `app/change-password/*` — forced password change.
- Route shell moved to `app/(app)/layout.tsx`; the root layout now only holds
  `<html>`, fonts and the RTL toaster.
- `app/(app)/layout.tsx` sets `export const instant = false` and blocks on the
  session. Wrapping the sidebar in `<Suspense>` inside `SidebarProvider` caused
  a production hydration mismatch, so the shell renders on the server instead.
- `app/(app)/page.tsx` calls `await connection()` before reading `searchParams`
  or the current Persian date; otherwise Cache Components flags `new Date()`
  during prerendering.
- `app/(app)/page.tsx` — reads `?y=&m=`, loads the month behind `<Suspense>`,
  renders the lunch dashboard.
- `lib/data/lunch.ts` — month payload (price, weekly menu, overrides, closed
  dates, reservations, window).
- `lib/lunch/actions.ts` — `toggleReservation` server action with optimistic UI.
- Removed: `DEFAULT_WEEKDAY_MENU`, `PRICE_PER_DAY`, the sample sidebar user,
  `app/dashboard/page.tsx`, `components/nav-projects.tsx`,
  `components/team-switcher.tsx`, `components/lunch/Header.tsx`.

## Dashboard UX

- Sidebar collapses to a 64px icon rail (`collapsible="icon"`), toggled from the
  header trigger, the rail, or Ctrl/Cmd+B. The state is persisted in the
  `sidebar_state` cookie and read server-side in `app/(app)/layout.tsx` so the
  first paint matches. Collapsed nav renders icon-only links with tooltips and
  hides the brand text and user chevron.
- On mobile the sidebar becomes a Sheet opened by the same header trigger.
- The month grid is **read-only below 768px**: tapping a cell selects that day
  in the card and scrolls to it, but never writes a reservation.
- The day card is a carousel: prev/next arrows, swipe (left = next), a
  "N از M روز کاری" counter, and horizontal day chips with reserved dots. It is
  the primary booking surface on mobile and sits above the grid there.
- `findGregorianDateForPersian` now searches whole days anchored at midnight
  UTC. The old arbitrary-time binary search skipped the window before the
  Tehran day boundary and returned the same fallback date for ~2 days per
  month, which caused duplicate React keys and could have stored reservations
  against the wrong date.

## Admin area & roles

Four roles, ordered `employee < manager < admin < owner`:

| role       | access                                                             |
| ---------- | ------------------------------------------------------------------ |
| `employee` | menu + own reservations                                            |
| `manager`  | + `/admin` report (all reservations, staff directory)              |
| `admin`    | + `/admin/menu` (weekly menu, overrides, price and booking window) |
| `owner`    | + `/admin/users` (assign roles)                                    |

- Migration `*_roles_and_admin.sql` widens the role check, adds
  `current_app_role()`, `is_manager()`, `is_admin()` (admin+owner) and
  `is_owner()`, and lets managers read all profiles/reservations for reporting.
- `lib/auth/roles.ts` mirrors the hierarchy in the app; `requireStaff()`,
  `requireAdmin()` and `requireOwner()` guard the admin routes and every admin
  server action.
- Sidebar is organised into categories, filtered by role: «خدمات کارکنان»
  (everyone), «گزارش‌ها» (manager+), «مدیریت» (admin+, with a users entry only
  for the owner). Rows carry a small tag (رزرو/گزارش/تنظیمات/نقش‌ها), the
  management category shows the current role, and the user menu shows a role
  badge. Collapsed mode links to each category's first page.
- `/admin` — KPIs (reservations, distinct employees vs active profiles, total
  cost, average per meal), per-day breakdown with dishes and a per-employee
  summary.
- `/admin/menu` — service settings (price, lead days, max advance), the seven
  weekday menu cards and per-date overrides with add/edit/delete.
- `/admin/users` (admin + owner) — full user management: create accounts
  (admin/owner sets the initial password and the employee must change it on
  first login), edit name/department/phone/role/active state, and delete with a
  confirmation. Shows username, employee code, phone (in `user_metadata`), last
  sign-in (from `auth.users`), created date and the synthetic login email.
  Admins can manage every account except owners and cannot assign the owner
  role; the owner can do everything, with self-demotion and last-owner guards.
- `scripts/provision-employees.mjs` accepts all four roles; the seeded account
  is the owner.

## Services (coffee, tea, …)

- `*_services_catalog.sql` replaces the coffee-only tables with:
  - `services(slug, name, unit_label, description, price_irt, max_per_day,
is_active, sort_order)` — everything the company provides,
  - `service_orders(user_id, service_id, service_date, quantity,
unit_price_irt)` with one row per employee/service/day,
  - `prepare_service_order()` (today-only, daily cap, active service, price
    always copied from the catalogue) and RLS: own rows + scoped reads via
    `can_view_user(user_id, 'reports.services')`,
  - a coffee row seeded from the old `app_settings` values, the old
    `coffee_orders` rows migrated and the table dropped.
- Employees use the «سرویس‌ها» tab (hash `#services`) instead of a coffee-only
  tab: one card per active service with a ± stepper, daily cap, unit price,
  today's cost and monthly totals.
- `/admin/services` shows monthly totals per service, daily and per-employee
  breakdowns; with `services.manage` the page also hosts the catalogue CRUD
  (add/rename/price/cap/active/sort, delete).
- Both the tab and the report degrade gracefully with a migration hint when the
  catalogue is missing.

## Day list & Excel export

- `*_lunch_day_management.sql` adds the `lunch.manage` capability and the RLS
  policies that let those users insert/delete reservations for other
  employees; `set_reservation_price()` now also enforces `can_reserve()` for
  staff bookings made on someone else's behalf.
- `/admin/daily` (sidebar: «لیست روز ناهار») shows the selected day's dish,
  reserved/total headcount and cost, and every employee in scope with a
  one-click reserve/cancel action (confirmation on cancel).
- Day chips cover the whole booking window, closed days are visibly disabled,
  and the page refreshes itself every 20 seconds for a live view.
- `/admin/daily/export?d=YYYY-MM-DD` returns the list as UTF-8-BOM CSV
  (Excel-safe Persian) with date, dish, rows and totals.

## Colleague directory

- `/directory` (sidebar: «همکاران») lists every active employee with unit,
  role and phone, highlights teammates, and supports server-side search.
- Phones live in `auth.users.user_metadata`, so the loader uses the service
  role server-side and only returns safe columns; `profiles` RLS stays strict.

## Teams, CEO role & permission matrix

- Migration `*_teams_and_permissions.sql` adds:
  - `ceo` to the role check and the signup trigger,
  - `departments(name, manager_id)` + `profiles.department_id`, backfilled from
    the legacy free-text `profiles.department`,
  - `role_permissions(role, capability, scope)` seeded with the defaults below,
  - helpers `capability_scope`, `has_capability`, `has_full_capability`,
    `managed_department_ids` and `can_view_user(user_id, capability)`,
  - RLS rewrites: `profiles` / `lunch_reservations` / `service_orders` selects
    go through the scoped `can_view_user`, menu + settings writes require
    `menu.manage` / `services.manage`, `departments` and `role_permissions` are
    owner-only writes.
- Capabilities: `reports.lunch`, `reports.services`, `users.view`,
  `menu.manage`, `lunch.manage`, `services.manage`, `users.manage`,
  `permissions.manage`, `teams.manage`. Scopes: `none | self | team | all`;
  manage capabilities are `none | all` only.
- Defaults: manager → reports + users.view = `team`; ceo → reports + users.view =
  `all`; admin → reports `all` + menu/lunch/services `all`; owner → `all`
  implicitly.
- App layer:
  - `lib/auth/scopes.ts` (client-safe catalogue, labels, defaults) and
    `lib/auth/permissions.ts` (`getMyAccess()` cached per request with graceful
    defaults when the migration is missing, `requireCapability`,
    `requireFullCapability`).
  - `lib/data/scope.ts` filters profiles by scope (department id, falling back to
    the text department), `lib/data/profiles.ts` tolerates a database without
    `profiles.department_id`.
  - Sidebar categories and tags are capability-driven (e.g. «گزارش‌ها · تیم من»).
  - `/admin/permissions` (owner): the full role × capability matrix in one form
    plus team creation, renaming, manager assignment and deletion.
  - `/admin` and `/admin/services` gained a department filter; `/admin/users`
    gained role/department/search filters, a team-aware department input and
    capability-gated create/edit/delete.
  - Data scoping is enforced in the loaders _and_ in RLS, so a manager cannot
    read another team's rows even with a crafted request.

## Digital configs (V2Ray)

- Migration `*_digital_configs.sql` adds `digital.manage`, `digital_settings`
  (default inbounds, self-service toggle, manager quota cap, sub base URL),
  `v2ray_quotas` (configs per employee, default 1) and `v2ray_configs`
  (one row per panel client).
- `lib/v2ray/xui.ts` is a small 3x-ui client: cookie login, inbound list,
  `addClient` / `delClient`, subscription URL builder. Credentials come from
  `XUI_BASE_URL` / `XUI_USERNAME` / `XUI_PASSWORD` (+ optional
  `XUI_SUB_BASE_URL`); without them the tab shows a setup notice.
- `lib/digital/provision.ts` creates the client (name = employee's full name,
  same uuid + subId on every chosen inbound), rolls back panel clients if any
  step fails, and enforces quotas: default 1 per employee, managers raise it up
  to `manager_quota_cap`, owner unlimited.
- New «کانفیگ» tab (`#config`) lists the user's subscriptions with copy/open
  links and, when self-service is on and quota allows, a create button.
- `/admin/config` (digital.manage) shows configs in scope with revoke, node
  pickers (owner/admin can choose any or all inbounds), the panel defaults form
  and a per-employee quota editor.

## Follow-ups

1. Optional: reservation history instead of hard deletes (audit trail).
2. Optional: phone OTP by configuring a provider in `supabase/config.toml`.
3. Optional: a real `.xlsx` export (the current CSV opens in Excel directly).
4. Optional: per-team lunch budgets.
