-- Role hierarchy: employee < manager < admin < owner.
--   employee: view menu, book own lunch
--   manager:  + read the lunch report (all reservations, profiles)
--   admin:    + manage menus, overrides and service settings
--   owner:    + assign roles

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('employee', 'manager', 'admin', 'owner'));

-- ---------------------------------------------------------------------------
-- Role helpers (JWT app_metadata is the authorization source)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif((select auth.jwt()) -> 'app_metadata' ->> 'role', ''),
    'employee'
  );
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_app_role() in ('manager', 'admin', 'owner');
$$;

-- Now also covers owner, so every existing menu/settings/profile policy that
-- calls is_admin() picks up the wider role set.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_app_role() in ('admin', 'owner');
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_app_role() = 'owner';
$$;

-- ---------------------------------------------------------------------------
-- Auth trigger: accept the new roles
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_role text;
begin
  v_username := nullif(new.raw_user_meta_data ->> 'username', '');
  if v_username is null then
    v_username := split_part(new.email, '@', 1);
  end if;

  v_role := nullif(new.raw_app_meta_data ->> 'role', '');
  if v_role is null
    or v_role not in ('employee', 'manager', 'admin', 'owner') then
    v_role := 'employee';
  end if;

  insert into public.profiles (
    id,
    username,
    full_name,
    employee_code,
    email,
    department,
    role
  )
  values (
    new.id,
    v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), v_username),
    nullif(new.raw_user_meta_data ->> 'employee_code', ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'department', ''),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Managers can read the staff directory and every reservation (reporting).
-- Writes stay restricted: menus/settings = admin+, roles = service role only.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_staff"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id or public.is_manager());

drop policy if exists "reservations_select_self_or_admin" on public.lunch_reservations;
create policy "reservations_select_self_or_staff"
on public.lunch_reservations
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_manager());
