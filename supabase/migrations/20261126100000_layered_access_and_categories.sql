-- Layered access control: roles, teams, team managers and per-person
-- exceptions, plus a shared data-category registry.
--
-- Resolution order (later layers win, grants widen, denies narrow):
--   role -> team -> team_manager -> user
-- Owners always resolve to 'all' so the instance cannot be locked out.

-- ---------------------------------------------------------------------------
-- 1. capability catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.access_capabilities (
  key text primary key,
  group_key text not null,
  sort_order integer not null default 0,
  scopes text[] not null default array['none', 'self', 'team', 'all'],
  category_module text,
  created_at timestamptz not null default now(),
  constraint access_capabilities_scopes_check
    check (
      'none' = any(scopes)
      and scopes <@ array['none', 'self', 'team', 'all']::text[]
    )
);

comment on table public.access_capabilities is
  'Known capabilities. Adding a feature means adding a row here.';
comment on column public.access_capabilities.category_module is
  'When set, category-scoped grants are allowed for this capability.''s module.';

insert into public.access_capabilities
  (key, group_key, sort_order, scopes, category_module)
values
  ('reports.lunch', 'reports', 10,
    array['none', 'self', 'team', 'all'], 'lunch'),
  ('reports.services', 'reports', 20,
    array['none', 'self', 'team', 'all'], 'services'),
  ('lunch.view', 'staff', 10,
    array['none', 'all'], 'lunch'),
  ('services.view', 'staff', 20,
    array['none', 'all'], 'services'),
  ('config.view', 'staff', 30,
    array['none', 'all'], null),
  ('directory.view', 'staff', 40,
    array['none', 'all'], null),
  ('team.activity', 'team', 10,
    array['none', 'team', 'all'], null),
  ('users.view', 'users', 10,
    array['none', 'self', 'team', 'all'], null),
  ('users.manage', 'users', 20,
    array['none', 'all'], null),
  ('menu.manage', 'lunch', 10,
    array['none', 'all'], 'lunch'),
  ('lunch.manage', 'lunch', 20,
    array['none', 'all'], null),
  ('services.manage', 'services', 10,
    array['none', 'all'], 'services'),
  ('digital.manage', 'digital', 10,
    array['none', 'team', 'all'], null),
  ('permissions.manage', 'system', 10,
    array['none', 'all'], null),
  ('teams.manage', 'system', 20,
    array['none', 'all'], null)
on conflict (key) do update
set group_key = excluded.group_key,
    sort_order = excluded.sort_order,
    scopes = excluded.scopes,
    category_module = excluded.category_module;

-- ---------------------------------------------------------------------------
-- 2. data categories
-- ---------------------------------------------------------------------------
create table if not exists public.access_categories (
  id uuid primary key default gen_random_uuid(),
  module text not null
    check (char_length(btrim(module)) between 2 and 40),
  slug text not null
    check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null
    check (char_length(btrim(name)) between 2 and 80),
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module, slug)
);

comment on table public.access_categories is
  'Shared content categories (services catalogue, lunch dishes, future modules).';

insert into public.access_categories (module, slug, name, sort_order)
values
  ('services', 'drinks', 'نوشیدنی', 10),
  ('services', 'snacks', 'میان‌وعده', 20),
  ('services', 'other', 'سایر', 90),
  ('lunch', 'main', 'غذای اصلی', 10),
  ('lunch', 'special', 'ویژه', 20)
on conflict (module, slug) do nothing;

-- ---------------------------------------------------------------------------
-- 3. grants
-- ---------------------------------------------------------------------------
create table if not exists public.access_grants (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null
    check (subject_type in ('role', 'team', 'team_manager', 'user')),
  role text
    check (role in ('employee', 'manager', 'ceo', 'admin', 'owner')),
  department_id uuid references public.departments (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  capability text not null references public.access_capabilities (key)
    on update cascade on delete cascade,
  category_id uuid references public.access_categories (id) on delete cascade,
  mode text not null default 'grant'
    check (mode in ('grant', 'deny')),
  scope text not null default 'none'
    check (scope in ('none', 'self', 'team', 'all')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_grants_subject_check check (
    (subject_type = 'role'
      and role is not null and department_id is null and user_id is null)
    or (subject_type in ('team', 'team_manager')
      and role is null and department_id is not null and user_id is null)
    or (subject_type = 'user'
      and role is null and department_id is null and user_id is not null)
  )
);

comment on table public.access_grants is
  'Role/team/manager/person grants. Grants widen, denies narrow, person wins.';

create unique index if not exists access_grants_subject_capability_key
on public.access_grants (
  subject_type,
  coalesce(role, ''),
  coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  capability,
  coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create index if not exists access_grants_department_idx
  on public.access_grants (department_id, capability);
create index if not exists access_grants_user_idx
  on public.access_grants (user_id, capability);
create index if not exists access_grants_capability_idx
  on public.access_grants (capability);

create or replace function public.validate_access_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_capability public.access_capabilities%rowtype;
  v_category public.access_categories%rowtype;
begin
  select * into v_capability
  from public.access_capabilities
  where key = new.capability;

  if not found then
    raise exception 'unknown_capability' using errcode = '22023';
  end if;

  if not (new.scope = any(v_capability.scopes)) then
    raise exception 'invalid_scope_for_capability' using errcode = '22023';
  end if;

  if new.category_id is not null then
    if v_capability.category_module is null then
      raise exception 'capability_not_category_aware' using errcode = '22023';
    end if;

    select * into v_category
    from public.access_categories
    where id = new.category_id;

    if not found or v_category.module <> v_capability.category_module then
      raise exception 'category_module_mismatch' using errcode = '22023';
    end if;
  end if;

  if new.subject_type = 'role' and new.mode = 'deny' then
    raise exception 'role_deny_not_supported' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists access_grants_validate on public.access_grants;
create trigger access_grants_validate
before insert or update on public.access_grants
for each row execute function public.validate_access_grant();

-- ---------------------------------------------------------------------------
-- 4. category columns on content tables
-- ---------------------------------------------------------------------------
alter table public.services
  add column if not exists category_id uuid
    references public.access_categories (id) on delete set null;

alter table public.weekly_menu
  add column if not exists category_id uuid
    references public.access_categories (id) on delete set null;

alter table public.menu_overrides
  add column if not exists category_id uuid
    references public.access_categories (id) on delete set null;

update public.services s
set category_id = c.id
from public.access_categories c
where s.category_id is null
  and c.module = 'services'
  and c.slug = case when s.slug = 'coffee' then 'drinks' else 'other' end;

-- ---------------------------------------------------------------------------
-- 5. migrate role_permissions into grants
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.role_permissions') is not null then
    insert into public.access_grants
      (subject_type, role, capability, mode, scope)
    select 'role', rp.role, rp.capability, 'grant', rp.scope
    from public.role_permissions rp
    where rp.capability in (
      select key from public.access_capabilities
    )
    on conflict do nothing;
  end if;
end
$$;

-- New employee-facing sections: everyone keeps the access they have today.
insert into public.access_grants
  (subject_type, role, capability, mode, scope)
values
  ('role', 'employee', 'lunch.view', 'grant', 'all'),
  ('role', 'employee', 'services.view', 'grant', 'all'),
  ('role', 'employee', 'config.view', 'grant', 'all'),
  ('role', 'employee', 'directory.view', 'grant', 'all'),
  ('role', 'manager', 'lunch.view', 'grant', 'all'),
  ('role', 'manager', 'services.view', 'grant', 'all'),
  ('role', 'manager', 'config.view', 'grant', 'all'),
  ('role', 'manager', 'directory.view', 'grant', 'all'),
  ('role', 'manager', 'team.activity', 'grant', 'team'),
  ('role', 'ceo', 'lunch.view', 'grant', 'all'),
  ('role', 'ceo', 'services.view', 'grant', 'all'),
  ('role', 'ceo', 'config.view', 'grant', 'all'),
  ('role', 'ceo', 'directory.view', 'grant', 'all'),
  ('role', 'ceo', 'team.activity', 'grant', 'all'),
  ('role', 'admin', 'lunch.view', 'grant', 'all'),
  ('role', 'admin', 'services.view', 'grant', 'all'),
  ('role', 'admin', 'config.view', 'grant', 'all'),
  ('role', 'admin', 'directory.view', 'grant', 'all'),
  ('role', 'admin', 'team.activity', 'grant', 'all'),
  ('role', 'owner', 'lunch.view', 'grant', 'all'),
  ('role', 'owner', 'services.view', 'grant', 'all'),
  ('role', 'owner', 'config.view', 'grant', 'all'),
  ('role', 'owner', 'directory.view', 'grant', 'all'),
  ('role', 'owner', 'team.activity', 'grant', 'all')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 6. resolution helpers
-- ---------------------------------------------------------------------------
create or replace function public.scope_rank(p_scope text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_scope
    when 'all' then 3
    when 'team' then 2
    when 'self' then 1
    else 0
  end;
$$;

create or replace function public.scope_from_rank(p_rank integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_rank, 0) >= 3 then 'all'
    when p_rank = 2 then 'team'
    when p_rank = 1 then 'self'
    else 'none'
  end;
$$;

-- One subject (role or a single department) with category-specific fallback
-- to its capability-wide row.
create or replace function public.grant_scope_for(
  p_capability text,
  p_category_id uuid,
  p_role text,
  p_department_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case when g.mode = 'deny' then 'none' else g.scope end
      from public.access_grants g
      where g.capability = p_capability
        and g.role is not distinct from p_role
        and g.department_id is not distinct from p_department_id
        and g.user_id is not distinct from p_user_id
        and g.category_id is not distinct from p_category_id
      limit 1
    ),
    (
      select case when g.mode = 'deny' then 'none' else g.scope end
      from public.access_grants g
      where g.capability = p_capability
        and g.role is not distinct from p_role
        and g.department_id is not distinct from p_department_id
        and g.user_id is not distinct from p_user_id
        and g.category_id is null
        and p_category_id is not null
      limit 1
    ),
    'none'
  );
$$;

-- Aggregates many departments: any deny in the layer wins, otherwise the
-- widest grant wins. Used for team membership and managed teams.
create or replace function public.layer_scope(
  p_subject_type text,
  p_department_ids uuid[],
  p_capability text,
  p_category_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when count(*) = 0 then null
        when bool_or(g.mode = 'deny') then 'none'
        else public.scope_from_rank(max(public.scope_rank(g.scope))::integer)
      end
      from public.access_grants g
      where g.subject_type = p_subject_type
        and g.capability = p_capability
        and g.department_id = any(p_department_ids)
        and g.category_id is not distinct from p_category_id
    ),
    (
      select case
        when count(*) = 0 then null
        when bool_or(g.mode = 'deny') then 'none'
        else public.scope_from_rank(max(public.scope_rank(g.scope))::integer)
      end
      from public.access_grants g
      where g.subject_type = p_subject_type
        and g.capability = p_capability
        and g.department_id = any(p_department_ids)
        and g.category_id is null
        and p_category_id is not null
    ),
    'none'
  );
$$;

create or replace function public.effective_scope(
  p_capability text,
  p_category_id uuid default null,
  p_user_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role text;
  v_department_id uuid;
  v_role_scope text;
  v_team_scope text;
  v_manager_scope text;
  v_user_scope text;
begin
  v_uid := coalesce(p_user_id, (select auth.uid()));

  select p.role, p.department_id
  into v_role, v_department_id
  from public.profiles p
  where p.id = v_uid;

  -- Fail closed when the profile is missing, instead of trusting a stale JWT.
  if v_role is null then
    return 'none';
  end if;

  if v_role = 'owner' then
    return 'all';
  end if;

  v_role_scope := public.grant_scope_for(
    p_capability, p_category_id, v_role, null, null
  );

  v_team_scope := public.layer_scope(
    'team',
    case
      when v_department_id is null then array[]::uuid[]
      else array[v_department_id]
    end,
    p_capability,
    p_category_id
  );

  v_manager_scope := public.layer_scope(
    'team_manager',
    array(
      select d.id
      from public.departments d
      where d.manager_id = v_uid
    ),
    p_capability,
    p_category_id
  );

  select coalesce(
    (
      select case when g.mode = 'deny' then 'none' else g.scope end
      from public.access_grants g
      where g.subject_type = 'user'
        and g.user_id = v_uid
        and g.capability = p_capability
        and g.category_id is not distinct from p_category_id
      limit 1
    ),
    (
      select case when g.mode = 'deny' then 'none' else g.scope end
      from public.access_grants g
      where g.subject_type = 'user'
        and g.user_id = v_uid
        and g.capability = p_capability
        and g.category_id is null
        and p_category_id is not null
      limit 1
    )
  ) into v_user_scope;

  if v_user_scope is not null then
    return v_user_scope;
  end if;

  return public.scope_from_rank(
    greatest(
      public.scope_rank(v_role_scope),
      public.scope_rank(v_team_scope),
      public.scope_rank(v_manager_scope)
    )
  );
end;
$$;

create or replace function public.capability_scope(p_capability text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.effective_scope(p_capability, null, (select auth.uid()));
$$;

create or replace function public.category_scope(
  p_capability text,
  p_category_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.effective_scope(p_capability, p_category_id, (select auth.uid()));
$$;

create or replace function public.can_view_category(
  p_capability text,
  p_category_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.category_scope(p_capability, p_category_id) <> 'none';
$$;

create or replace function public.effective_access_for(p_user_id uuid)
returns table (capability text, category_id uuid, scope text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.key, null::uuid, public.effective_scope(c.key, null, p_user_id)
  from public.access_capabilities c
  where public.has_full_capability('permissions.manage')
     or p_user_id = (select auth.uid())
  union all
  select c.key, cat.id, public.effective_scope(c.key, cat.id, p_user_id)
  from public.access_capabilities c
  join public.access_categories cat
    on cat.module = c.category_module
   and cat.is_active
  where c.category_module is not null
    and (
      public.has_full_capability('permissions.manage')
      or p_user_id = (select auth.uid())
    );
$$;

revoke all on function public.effective_access_for(uuid) from public;
revoke all on function public.effective_access_for(uuid) from anon;
grant execute on function public.effective_access_for(uuid) to authenticated;

create or replace function public.my_effective_access()
returns table (capability text, category_id uuid, scope text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.effective_access_for((select auth.uid()));
$$;

create or replace function public.team_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.departments d
  where d.manager_id = (select auth.uid())
  union
  select p.department_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.department_id is not null;
$$;

create or replace function public.lunch_day_category(p_service_date date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select o.category_id
      from public.menu_overrides o
      where o.service_date = p_service_date
    ),
    (
      select w.category_id
      from public.weekly_menu w
      where w.weekday = public.service_weekday(p_service_date)
        and w.is_enabled
    )
  );
$$;

create or replace function public.can_view_service(
  p_service_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.services s
    where s.id = p_service_id
      and public.category_scope(p_capability, s.category_id) <> 'none'
  );
$$;

create or replace function public.can_order_service(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.services s
    where s.id = p_service_id
      and s.is_active
      and public.category_scope('services.view', s.category_id) <> 'none'
  );
$$;

revoke all on function public.grant_scope_for(text, uuid, text, uuid, uuid)
  from public;
revoke all on function public.layer_scope(text, uuid[], text, uuid) from public;
revoke all on function public.team_department_ids() from public;
revoke all on function public.lunch_day_category(date) from public;
revoke all on function public.can_order_service(uuid) from public;
revoke all on function public.can_view_service(uuid, text) from public;

revoke all on function public.effective_scope(text, uuid, uuid) from public;
revoke all on function public.effective_scope(text, uuid, uuid) from anon;
grant execute on function public.effective_scope(text, uuid, uuid)
  to authenticated;

revoke all on function public.capability_scope(text) from public;
revoke all on function public.capability_scope(text) from anon;
grant execute on function public.capability_scope(text) to authenticated;

revoke all on function public.category_scope(text, uuid) from public;
revoke all on function public.category_scope(text, uuid) from anon;
grant execute on function public.category_scope(text, uuid) to authenticated;

revoke all on function public.can_view_category(text, uuid) from public;
revoke all on function public.can_view_category(text, uuid) from anon;
grant execute on function public.can_view_category(text, uuid) to authenticated;

revoke all on function public.my_effective_access() from public;
revoke all on function public.my_effective_access() from anon;
grant execute on function public.my_effective_access() to authenticated;

grant execute on function public.lunch_day_category(date) to authenticated;
grant execute on function public.can_order_service(uuid) to authenticated;
grant execute on function public.can_view_service(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. category-aware booking / ordering rules
-- ---------------------------------------------------------------------------
create or replace function public.can_reserve(p_service_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select
      coalesce(
        (select min_lead_days from public.app_settings where id = 1),
        1
      ) as min_lead_days,
      coalesce(
        (select max_advance_days from public.app_settings where id = 1),
        14
      ) as max_advance_days
  )
  select
    p_service_date is not null
    and p_service_date >= public.today_tehran() + (select min_lead_days from cfg)
    and p_service_date <= public.today_tehran() + (select max_advance_days from cfg)
    and public.service_weekday(p_service_date) <> 6
    and public.can_view_category(
      'lunch.view',
      public.lunch_day_category(p_service_date)
    )
    and not exists (
      select 1
      from public.menu_overrides o
      where o.service_date = p_service_date
        and o.is_closed
    )
    and (
      exists (
        select 1
        from public.menu_overrides o
        where o.service_date = p_service_date
      )
      or exists (
        select 1
        from public.weekly_menu w
        where w.weekday = public.service_weekday(p_service_date)
          and w.is_enabled
      )
    );
$$;

create or replace function public.can_manage_reservation_day(p_service_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select coalesce(
      (select max_advance_days from public.app_settings where id = 1),
      14
    ) as max_advance_days
  )
  select
    p_service_date is not null
    and p_service_date >= public.today_tehran()
    and p_service_date <= public.today_tehran() + (select max_advance_days from cfg)
    and public.service_weekday(p_service_date) <> 6
    and public.can_view_category(
      'lunch.view',
      public.lunch_day_category(p_service_date)
    )
    and not exists (
      select 1
      from public.menu_overrides o
      where o.service_date = p_service_date
        and o.is_closed
    )
    and (
      exists (
        select 1
        from public.menu_overrides o
        where o.service_date = p_service_date
      )
      or exists (
        select 1
        from public.weekly_menu w
        where w.weekday = public.service_weekday(p_service_date)
          and w.is_enabled
      )
    );
$$;

create or replace function public.prepare_service_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services%rowtype;
begin
  select * into v_service from public.services where id = new.service_id;

  if not found then
    raise exception 'service_not_found' using errcode = '22023';
  end if;

  if new.service_date <> public.today_tehran() then
    raise exception 'service_order_not_today' using errcode = '22023';
  end if;

  if new.quantity > v_service.max_per_day then
    raise exception 'service_quantity_out_of_range' using errcode = '22023';
  end if;

  if not v_service.is_active then
    raise exception 'service_inactive' using errcode = '22023';
  end if;

  if not public.can_order_service(new.service_id) then
    raise exception 'service_category_denied' using errcode = '42501';
  end if;

  new.unit_price_irt := v_service.price_irt;
  return new;
end;
$$;

-- Atomic replacement of one subject's grants. Used by the owner console so a
-- failed save never leaves a subject with half its access.
create or replace function public.set_role_grants(
  p_role text,
  p_grants jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_full_capability('permissions.manage') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_role not in ('employee', 'manager', 'ceo', 'admin', 'owner') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  delete from public.access_grants
  where subject_type = 'role'
    and role = p_role;

  insert into public.access_grants
    (subject_type, role, capability, mode, scope, created_by)
  select
    'role',
    p_role,
    g ->> 'capability',
    coalesce(g ->> 'mode', 'grant'),
    coalesce(g ->> 'scope', 'none'),
    (select auth.uid())
  from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb)) g;
end;
$$;

create or replace function public.set_subject_grants(
  p_subject_type text,
  p_department_id uuid,
  p_user_id uuid,
  p_grants jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_full_capability('permissions.manage') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_subject_type not in ('team', 'team_manager', 'user') then
    raise exception 'invalid_subject' using errcode = '22023';
  end if;

  delete from public.access_grants
  where subject_type = p_subject_type
    and department_id is not distinct from p_department_id
    and user_id is not distinct from p_user_id;

  insert into public.access_grants
    (subject_type, department_id, user_id, capability, category_id, mode, scope,
     created_by)
  select
    p_subject_type,
    p_department_id,
    p_user_id,
    g ->> 'capability',
    nullif(g ->> 'category_id', '')::uuid,
    coalesce(g ->> 'mode', 'grant'),
    coalesce(g ->> 'scope', 'none'),
    (select auth.uid())
  from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb)) g;
end;
$$;

revoke all on function public.set_role_grants(text, jsonb) from public;
revoke all on function public.set_role_grants(text, jsonb) from anon;
grant execute on function public.set_role_grants(text, jsonb) to authenticated;

revoke all on function public.set_subject_grants(text, uuid, uuid, jsonb)
  from public;
revoke all on function public.set_subject_grants(text, uuid, uuid, jsonb)
  from anon;
grant execute on function public.set_subject_grants(text, uuid, uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
alter table public.access_capabilities enable row level security;
alter table public.access_categories enable row level security;
alter table public.access_grants enable row level security;

revoke all on table public.access_capabilities from anon;
revoke all on table public.access_categories from anon;
revoke all on table public.access_grants from anon;

grant select on table public.access_capabilities to authenticated;
grant select, insert, update, delete on table public.access_categories
  to authenticated;
grant select, insert, update, delete on table public.access_grants
  to authenticated;

drop policy if exists "access_capabilities_select_authenticated"
  on public.access_capabilities;
create policy "access_capabilities_select_authenticated"
on public.access_capabilities for select to authenticated using (true);

drop policy if exists "access_categories_select_authenticated"
  on public.access_categories;
create policy "access_categories_select_authenticated"
on public.access_categories for select to authenticated using (true);

drop policy if exists "access_categories_write_permissions"
  on public.access_categories;
create policy "access_categories_write_permissions"
on public.access_categories for all to authenticated
using (public.has_full_capability('permissions.manage'))
with check (public.has_full_capability('permissions.manage'));

drop policy if exists "access_grants_select_permissions" on public.access_grants;
create policy "access_grants_select_permissions"
on public.access_grants for select to authenticated
using (public.has_full_capability('permissions.manage'));

drop policy if exists "access_grants_write_permissions" on public.access_grants;
create policy "access_grants_write_permissions"
on public.access_grants for all to authenticated
using (public.has_full_capability('permissions.manage'))
with check (public.has_full_capability('permissions.manage'));

-- Managers see their own team as well as the teams they manage.
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
          then p.department_id in (select public.team_department_ids())
        else false
      end
      from public.profiles p
      where p.id = p_user_id
    ), false);
$$;

revoke all on function public.can_view_user(uuid, text) from public;
revoke all on function public.can_view_user(uuid, text) from anon;
grant execute on function public.can_view_user(uuid, text) to authenticated;

drop policy if exists "departments_write_owner" on public.departments;
drop policy if exists "departments_write_permissions" on public.departments;
create policy "departments_write_permissions"
on public.departments for all to authenticated
using (public.has_full_capability('teams.manage'))
with check (public.has_full_capability('teams.manage'));

drop policy if exists "services_select_authenticated" on public.services;
drop policy if exists "services_select_scoped" on public.services;
create policy "services_select_scoped"
on public.services for select to authenticated
using (
  public.category_scope('services.view', category_id) <> 'none'
  or public.category_scope('services.manage', category_id) <> 'none'
  or public.category_scope('reports.services', category_id) <> 'none'
);

drop policy if exists "weekly_menu_select_authenticated" on public.weekly_menu;
drop policy if exists "weekly_menu_select_scoped" on public.weekly_menu;
create policy "weekly_menu_select_scoped"
on public.weekly_menu for select to authenticated
using (
  public.category_scope('lunch.view', category_id) <> 'none'
  or public.category_scope('menu.manage', category_id) <> 'none'
  or public.category_scope('reports.lunch', category_id) <> 'none'
);

drop policy if exists "menu_overrides_select_authenticated" on public.menu_overrides;
drop policy if exists "menu_overrides_select_scoped" on public.menu_overrides;
create policy "menu_overrides_select_scoped"
on public.menu_overrides for select to authenticated
using (
  public.category_scope('lunch.view', category_id) <> 'none'
  or public.category_scope('menu.manage', category_id) <> 'none'
);

-- Reservations and guests follow the dish category, so a denied category is
-- hard-hidden from reports as well as from the booking UI.
drop policy if exists "reservations_select_self_or_staff" on public.lunch_reservations;
drop policy if exists "reservations_select_self_or_admin" on public.lunch_reservations;
drop policy if exists "reservations_select_scoped" on public.lunch_reservations;
create policy "reservations_select_scoped"
on public.lunch_reservations for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    public.can_view_user(user_id, 'reports.lunch')
    and public.can_view_category(
      'reports.lunch',
      public.lunch_day_category(service_date)
    )
  )
);

drop policy if exists "lunch_guests_select_staff" on public.lunch_guests;
create policy "lunch_guests_select_staff"
on public.lunch_guests for select to authenticated
using (
  public.can_view_category(
    'reports.lunch',
    public.lunch_day_category(service_date)
  )
);

drop policy if exists "service_orders_select_scoped" on public.service_orders;
create policy "service_orders_select_scoped"
on public.service_orders for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    public.can_view_user(user_id, 'reports.services')
    and public.can_view_service(service_id, 'reports.services')
  )
);

drop policy if exists "service_orders_insert_self" on public.service_orders;
create policy "service_orders_insert_self"
on public.service_orders for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.can_order_service(service_id)
);

-- Lunch managers may add a guest only on a day whose dish they can see.
drop policy if exists "lunch_guests_insert_staff" on public.lunch_guests;
create policy "lunch_guests_insert_staff"
on public.lunch_guests for insert to authenticated
with check (
  public.has_full_capability('lunch.manage')
  and public.can_view_category('lunch.view', public.lunch_day_category(service_date))
  and service_date >= public.today_tehran()
  and service_date <= public.today_tehran() + coalesce(
    (select max_advance_days from public.app_settings where id = 1),
    14
  )
  and public.service_weekday(service_date) <> 6
  and not exists (
    select 1
    from public.menu_overrides o
    where o.service_date = lunch_guests.service_date
      and o.is_closed
  )
);

-- ---------------------------------------------------------------------------
-- 9. drop the superseded role matrix
-- ---------------------------------------------------------------------------
drop table if exists public.role_permissions;

-- ---------------------------------------------------------------------------
-- 10. updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists access_categories_touch_updated_at
  on public.access_categories;
create trigger access_categories_touch_updated_at
before update on public.access_categories
for each row execute function public.touch_updated_at();

drop trigger if exists access_grants_touch_updated_at on public.access_grants;
create trigger access_grants_touch_updated_at
before update on public.access_grants
for each row execute function public.touch_updated_at();
