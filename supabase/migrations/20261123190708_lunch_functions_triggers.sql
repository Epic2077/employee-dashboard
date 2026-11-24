-- Booking rules, role helpers and triggers.

-- Current calendar day in Tehran, used by every date-sensitive rule.
create or replace function public.today_tehran()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Tehran')::date;
$$;

-- Persian weekday index: 0 = Saturday .. 6 = Friday.
create or replace function public.service_weekday(p_service_date date)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (((extract(dow from p_service_date)::int) + 1) % 7)::smallint;
$$;

-- Authorization helper: role is carried in the JWT app_metadata, never in
-- user_metadata (which the user can edit).
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- Central booking rule: tomorrow .. today + max_advance_days, never Friday,
-- never a closed date, and only when a menu exists.
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

-- Usernames map to an internal synthetic email. Only the service role may
-- resolve them, so the anon key cannot enumerate employees.
create or replace function public.resolve_login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.email
  from public.profiles p
  where p.username_key = public.normalize_username(p_username)
    and p.is_active
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
revoke all on function public.resolve_login_email(text) from anon;
revoke all on function public.resolve_login_email(text) from authenticated;
grant execute on function public.resolve_login_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
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
  if v_role is null or v_role not in ('employee', 'admin') then
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

create or replace function public.set_reservation_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Employees are bound by the booking window; service-role imports are not.
  if new.user_id = (select auth.uid())
    and not public.can_reserve(new.service_date) then
    raise exception 'reservation_not_allowed'
      using errcode = 'P0001',
            hint = 'The date is outside the booking window or unavailable.';
  end if;

  if new.price_irt is null or new.price_irt = 0 then
    new.price_irt := coalesce(
      (select price_per_day_irt from public.app_settings where id = 1),
      100000
    );
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
revoke all on function public.set_reservation_price() from public;
revoke all on function public.set_reservation_price() from anon;
revoke all on function public.set_reservation_price() from authenticated;
revoke all on function public.touch_updated_at() from public;
revoke all on function public.touch_updated_at() from anon;
revoke all on function public.touch_updated_at() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists lunch_reservations_before_insert on public.lunch_reservations;
create trigger lunch_reservations_before_insert
before insert on public.lunch_reservations
for each row execute function public.set_reservation_price();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row execute function public.touch_updated_at();

drop trigger if exists weekly_menu_touch_updated_at on public.weekly_menu;
create trigger weekly_menu_touch_updated_at
before update on public.weekly_menu
for each row execute function public.touch_updated_at();

drop trigger if exists menu_overrides_touch_updated_at on public.menu_overrides;
create trigger menu_overrides_touch_updated_at
before update on public.menu_overrides
for each row execute function public.touch_updated_at();
