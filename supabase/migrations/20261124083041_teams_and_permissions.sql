-- Teams (departments), the CEO role and the owner-editable permission matrix.

-- ---------------------------------------------------------------------------
-- 1. ceo role
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('employee', 'manager', 'ceo', 'admin', 'owner'));

create or replace function public.is_manager()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_app_role() in ('manager', 'ceo', 'admin', 'owner');
$$;

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
    or v_role not in ('employee', 'manager', 'ceo', 'admin', 'owner') then
    v_role := 'employee';
  end if;

  insert into public.profiles (
    id, username, full_name, employee_code, email, department, role
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
-- 2. departments
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
    check (char_length(btrim(name)) between 2 and 80),
  manager_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists departments_manager_idx
  on public.departments (manager_id);

comment on table public.departments is
  'Teams. manager_id decides whose data the manager can see (team scope).';

alter table public.profiles
  add column if not exists department_id uuid
    references public.departments (id) on delete set null;

create index if not exists profiles_department_idx
  on public.profiles (department_id);

-- Backfill from the legacy free-text department column.
insert into public.departments (name)
select distinct btrim(p.department)
from public.profiles p
where p.department is not null and btrim(p.department) <> ''
on conflict (name) do nothing;

update public.profiles p
set department_id = d.id
from public.departments d
where p.department_id is null
  and p.department is not null
  and btrim(p.department) = d.name;

-- Assign existing managers as managers of their text department.
update public.departments d
set manager_id = m.id
from (
  select distinct on (btrim(department)) id, btrim(department) as dept
  from public.profiles
  where role = 'manager'
    and department is not null
    and btrim(department) <> ''
  order by btrim(department), created_at
) m
where m.dept = d.name and d.manager_id is null;

-- ---------------------------------------------------------------------------
-- 3. permission matrix
-- ---------------------------------------------------------------------------
create table if not exists public.role_permissions (
  role text not null,
  capability text not null,
  scope text not null,
  updated_at timestamptz not null default now(),
  primary key (role, capability)
);

-- Re-runnable: an earlier attempt may have created this table with the old
-- coffee capabilities, so normalise the constraints and drop legacy rows.
alter table public.role_permissions
  drop constraint if exists role_permissions_role_check,
  drop constraint if exists role_permissions_capability_check,
  drop constraint if exists role_permissions_scope_check;

delete from public.role_permissions
where capability in ('reports.coffee', 'coffee.manage');

alter table public.role_permissions
  add constraint role_permissions_role_check
    check (role in ('employee', 'manager', 'ceo', 'admin', 'owner')),
  add constraint role_permissions_capability_check
    check (capability in (
      'reports.lunch',
      'reports.services',
      'users.view',
      'menu.manage',
      'lunch.manage',
      'services.manage',
      'users.manage',
      'permissions.manage',
      'teams.manage'
    )),
  add constraint role_permissions_scope_check
    check (scope in ('none', 'self', 'team', 'all'));

comment on table public.role_permissions is
  'Owner-editable role matrix: capability -> scope (none/self/team/all).';

insert into public.role_permissions (role, capability, scope) values
  ('manager', 'reports.lunch', 'team'),
  ('manager', 'reports.services', 'team'),
  ('manager', 'users.view', 'team'),
  ('ceo', 'reports.lunch', 'all'),
  ('ceo', 'reports.services', 'all'),
  ('ceo', 'users.view', 'all'),
  ('admin', 'reports.lunch', 'all'),
  ('admin', 'reports.services', 'all'),
  ('admin', 'menu.manage', 'all'),
  ('admin', 'lunch.manage', 'all'),
  ('admin', 'services.manage', 'all'),
  ('owner', 'reports.lunch', 'all'),
  ('owner', 'reports.services', 'all'),
  ('owner', 'users.view', 'all'),
  ('owner', 'menu.manage', 'all'),
  ('owner', 'lunch.manage', 'all'),
  ('owner', 'services.manage', 'all'),
  ('owner', 'users.manage', 'all'),
  ('owner', 'permissions.manage', 'all'),
  ('owner', 'teams.manage', 'all')
on conflict (role, capability) do nothing;

-- ---------------------------------------------------------------------------
-- 4. scope helpers
-- ---------------------------------------------------------------------------
create or replace function public.capability_scope(p_capability text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when public.current_app_role() = 'owner' then 'all'
    else coalesce((
      select rp.scope
      from public.role_permissions rp
      where rp.role = public.current_app_role()
        and rp.capability = p_capability
    ), 'none')
  end;
$$;

create or replace function public.has_capability(p_capability text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.capability_scope(p_capability) <> 'none';
$$;

create or replace function public.has_full_capability(p_capability text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.capability_scope(p_capability) = 'all';
$$;

create or replace function public.managed_department_ids()
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select d.id
  from public.departments d
  where d.manager_id = (select auth.uid());
$$;

-- Whether the current user may read the given profile under a capability.
-- SECURITY DEFINER so the profiles lookup does not re-enter the profiles RLS
-- policy (which would recurse).
create or replace function public.can_view_user(
  p_user_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = (select auth.uid())
    or coalesce((
      select case
        when public.capability_scope(p_capability) = 'all' then true
        when public.capability_scope(p_capability) = 'team'
          then p.department_id in (select public.managed_department_ids())
        else false
      end
      from public.profiles p
      where p.id = p_user_id
    ), false);
$$;

revoke all on function public.can_view_user(uuid, text) from public;
revoke all on function public.can_view_user(uuid, text) from anon;
grant execute on function public.can_view_user(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.role_permissions enable row level security;

revoke all on table public.departments from anon;
revoke all on table public.role_permissions from anon;

grant select, insert, update, delete on table public.departments
  to authenticated;
grant select, insert, update, delete on table public.role_permissions
  to authenticated;

drop policy if exists "departments_select_authenticated" on public.departments;
create policy "departments_select_authenticated"
on public.departments for select to authenticated using (true);

drop policy if exists "departments_write_owner" on public.departments;
create policy "departments_write_owner"
on public.departments for all to authenticated
using (public.is_owner()) with check (public.is_owner());

drop policy if exists "role_permissions_select_authenticated" on public.role_permissions;
create policy "role_permissions_select_authenticated"
on public.role_permissions for select to authenticated using (true);

drop policy if exists "role_permissions_write_owner" on public.role_permissions;
create policy "role_permissions_write_owner"
on public.role_permissions for all to authenticated
using (public.is_owner()) with check (public.is_owner());

-- Scoped reads
-- Drop both the legacy and the current policy names so this file can be
-- re-run after an earlier partial application.
drop policy if exists "profiles_select_self_or_staff" on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or public.can_view_user(id, 'users.view')
);

drop policy if exists "reservations_select_self_or_staff" on public.lunch_reservations;
drop policy if exists "reservations_select_self_or_admin" on public.lunch_reservations;
drop policy if exists "reservations_select_scoped" on public.lunch_reservations;
create policy "reservations_select_scoped"
on public.lunch_reservations for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_view_user(user_id, 'reports.lunch')
);

-- Capability-based writes for the service configuration.
drop policy if exists "app_settings_write_admin" on public.app_settings;
create policy "app_settings_write_admin"
on public.app_settings for all to authenticated
using (
  public.has_full_capability('menu.manage')
  or public.has_full_capability('services.manage')
)
with check (
  public.has_full_capability('menu.manage')
  or public.has_full_capability('services.manage')
);

drop policy if exists "weekly_menu_write_admin" on public.weekly_menu;
create policy "weekly_menu_write_admin"
on public.weekly_menu for all to authenticated
using (public.has_full_capability('menu.manage'))
with check (public.has_full_capability('menu.manage'));

drop policy if exists "menu_overrides_write_admin" on public.menu_overrides;
create policy "menu_overrides_write_admin"
on public.menu_overrides for all to authenticated
using (public.has_full_capability('menu.manage'))
with check (public.has_full_capability('menu.manage'));

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update to authenticated
using (public.has_full_capability('users.manage'))
with check (public.has_full_capability('users.manage'));

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists departments_touch_updated_at on public.departments;
create trigger departments_touch_updated_at
before update on public.departments
for each row execute function public.touch_updated_at();

drop trigger if exists role_permissions_touch_updated_at on public.role_permissions;
create trigger role_permissions_touch_updated_at
before update on public.role_permissions
for each row execute function public.touch_updated_at();
