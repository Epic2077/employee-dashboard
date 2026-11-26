-- Fixes the layer precedence: a deny at a more specific layer (team or team
-- manager) must narrow the role baseline, while grants still widen it.
--
--   role scope
--     -> team layer:      deny => none, grant => max(role, grant), none => inherit
--     -> manager layer:   deny => none, grant => max(current, grant), none => inherit
--     -> person exception: deny => none, grant => scope (final)

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
        when bool_or(g.mode = 'deny') then 'deny'
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
        when bool_or(g.mode = 'deny') then 'deny'
        else public.scope_from_rank(max(public.scope_rank(g.scope))::integer)
      end
      from public.access_grants g
      where g.subject_type = p_subject_type
        and g.capability = p_capability
        and g.department_id = any(p_department_ids)
        and g.category_id is null
        and p_category_id is not null
    ),
    'inherit'
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
  v_team_layer text;
  v_manager_layer text;
  v_user_scope text;
  v_result text;
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

  v_result := public.grant_scope_for(
    p_capability, p_category_id, v_role, null, null
  );

  v_team_layer := public.layer_scope(
    'team',
    case
      when v_department_id is null then array[]::uuid[]
      else array[v_department_id]
    end,
    p_capability,
    p_category_id
  );

  if v_team_layer = 'deny' then
    v_result := 'none';
  elsif v_team_layer <> 'inherit' then
    v_result := public.scope_from_rank(
      greatest(
        public.scope_rank(v_result),
        public.scope_rank(v_team_layer)
      )
    );
  end if;

  v_manager_layer := public.layer_scope(
    'team_manager',
    array(
      select d.id
      from public.departments d
      where d.manager_id = v_uid
    ),
    p_capability,
    p_category_id
  );

  if v_manager_layer = 'deny' then
    v_result := 'none';
  elsif v_manager_layer <> 'inherit' then
    v_result := public.scope_from_rank(
      greatest(
        public.scope_rank(v_result),
        public.scope_rank(v_manager_layer)
      )
    );
  end if;

  -- A person exception has the final say.
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

  return v_result;
end;
$$;

-- Assigning somebody as a team manager should give them the manager defaults
-- immediately, even when their profile role is still `employee`. Teams that
-- already have explicit manager grants keep them untouched.
insert into public.access_grants
  (subject_type, department_id, capability, mode, scope)
select 'team_manager', d.id, g.capability, 'grant', g.scope
from public.departments d
join public.access_grants g
  on g.subject_type = 'role'
 and g.role = 'manager'
where not exists (
  select 1
  from public.access_grants x
  where x.subject_type = 'team_manager'
    and x.department_id = d.id
)
on conflict do nothing;

create or replace function public.seed_team_manager_grants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.access_grants
    (subject_type, department_id, capability, mode, scope)
  select 'team_manager', new.id, g.capability, 'grant', g.scope
  from public.access_grants g
  where g.subject_type = 'role'
    and g.role = 'manager'
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.seed_team_manager_grants() from public;

drop trigger if exists departments_seed_manager_grants on public.departments;
create trigger departments_seed_manager_grants
after insert on public.departments
for each row execute function public.seed_team_manager_grants();

-- Evaluate the permission-manager guard once instead of once per row.
create or replace function public.effective_access_for(p_user_id uuid)
returns table (capability text, category_id uuid, scope text)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed as (
    select (
      public.has_full_capability('permissions.manage')
      or p_user_id = (select auth.uid())
    ) as ok
  )
  select c.key, null::uuid, public.effective_scope(c.key, null, p_user_id)
  from public.access_capabilities c
  cross join allowed
  where allowed.ok
  union all
  select c.key, cat.id, public.effective_scope(c.key, cat.id, p_user_id)
  from public.access_capabilities c
  join public.access_categories cat
    on cat.module = c.category_module
   and cat.is_active
  cross join allowed
  where c.category_module is not null
    and allowed.ok;
$$;

revoke all on function public.layer_scope(text, uuid[], text, uuid) from public;
-- Internal only: public callers must go through capability_scope /
-- category_scope / my_effective_access, which always use their own auth.uid().
revoke all on function public.effective_scope(text, uuid, uuid) from public;
revoke all on function public.effective_scope(text, uuid, uuid) from anon;
revoke all on function public.effective_scope(text, uuid, uuid)
  from authenticated;

revoke all on function public.effective_access_for(uuid) from public;
revoke all on function public.effective_access_for(uuid) from anon;
grant execute on function public.effective_access_for(uuid) to authenticated;
