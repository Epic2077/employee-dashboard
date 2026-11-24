-- Row level security. Every table is locked down; access is granted per role
-- and per row. Anonymous users get nothing.

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.weekly_menu enable row level security;
alter table public.menu_overrides enable row level security;
alter table public.lunch_reservations enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.app_settings from anon;
revoke all on table public.weekly_menu from anon;
revoke all on table public.menu_overrides from anon;
revoke all on table public.lunch_reservations from anon;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
grant select on table public.profiles to authenticated;

-- Employees may only edit these columns. username, employee_code, email,
-- role, is_active and must_change_password stay immutable without the
-- service role (the change-password action clears the flag server-side).
revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, department)
  on table public.profiles to authenticated;

grant select on table public.app_settings to authenticated;
grant select on table public.weekly_menu to authenticated;
grant select on table public.menu_overrides to authenticated;

grant select, insert, delete on table public.lunch_reservations to authenticated;

-- Writes are still gated by the admin policies below; grants alone are not
-- enough. Kept in place so a future admin UI needs no schema change.
grant insert, update, delete on table public.app_settings to authenticated;
grant insert, update, delete on table public.weekly_menu to authenticated;
grant insert, update, delete on table public.menu_overrides to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id or public.is_admin());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------
drop policy if exists "app_settings_select_authenticated" on public.app_settings;
create policy "app_settings_select_authenticated"
on public.app_settings
for select
to authenticated
using (true);

drop policy if exists "app_settings_write_admin" on public.app_settings;
create policy "app_settings_write_admin"
on public.app_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- weekly_menu
-- ---------------------------------------------------------------------------
drop policy if exists "weekly_menu_select_authenticated" on public.weekly_menu;
create policy "weekly_menu_select_authenticated"
on public.weekly_menu
for select
to authenticated
using (true);

drop policy if exists "weekly_menu_write_admin" on public.weekly_menu;
create policy "weekly_menu_write_admin"
on public.weekly_menu
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- menu_overrides
-- ---------------------------------------------------------------------------
drop policy if exists "menu_overrides_select_authenticated" on public.menu_overrides;
create policy "menu_overrides_select_authenticated"
on public.menu_overrides
for select
to authenticated
using (true);

drop policy if exists "menu_overrides_write_admin" on public.menu_overrides;
create policy "menu_overrides_write_admin"
on public.menu_overrides
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- lunch_reservations
-- ---------------------------------------------------------------------------
drop policy if exists "reservations_select_self_or_admin" on public.lunch_reservations;
create policy "reservations_select_self_or_admin"
on public.lunch_reservations
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "reservations_insert_self" on public.lunch_reservations;
create policy "reservations_insert_self"
on public.lunch_reservations
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.can_reserve(service_date)
);

drop policy if exists "reservations_delete_self" on public.lunch_reservations;
create policy "reservations_delete_self"
on public.lunch_reservations
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and service_date >= public.today_tehran()
);

drop policy if exists "reservations_delete_admin" on public.lunch_reservations;
create policy "reservations_delete_admin"
on public.lunch_reservations
for delete
to authenticated
using (public.is_admin());
