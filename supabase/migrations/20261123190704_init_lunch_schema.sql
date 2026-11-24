-- Lunch service schema: employee profiles, service settings, menus and reservations.

-- Canonical username form used for login lookups. Persian/Arabic variants of
-- yeh and kaf are folded together, ZWNJ is dropped and whitespace is collapsed.
create or replace function public.normalize_username(p_username text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      translate(lower(btrim(coalesce(p_username, ''))), 'يك' || chr(8204), 'یک'),
      '\s+',
      ' ',
      'g'
    ),
    ''
  );
$$;

comment on function public.normalize_username(text) is
  'Normalizes employee usernames so Persian spelling variants match.';

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null
    check (char_length(btrim(username)) between 2 and 60),
  username_key text
    generated always as (public.normalize_username(username)) stored,
  full_name text not null,
  employee_code text,
  email text,
  department text,
  role text not null default 'employee'
    check (role in ('employee', 'admin')),
  avatar_url text,
  must_change_password boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_key_key
  on public.profiles (username_key);

create unique index if not exists profiles_employee_code_key
  on public.profiles (employee_code)
  where employee_code is not null;

create unique index if not exists profiles_email_key
  on public.profiles (lower(email))
  where email is not null;

comment on table public.profiles is
  'Employee directory. Mirrors auth.users; authorization role lives in app_metadata.';

-- ---------------------------------------------------------------------------
-- app_settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  price_per_day_irt bigint not null default 100000
    check (price_per_day_irt > 0),
  min_lead_days smallint not null default 1
    check (min_lead_days between 0 and 60),
  max_advance_days smallint not null default 14
    check (max_advance_days between 1 and 120),
  updated_at timestamptz not null default now(),
  constraint app_settings_window_check check (max_advance_days >= min_lead_days)
);

comment on table public.app_settings is
  'Lunch service configuration: price per meal and the booking window.';

-- ---------------------------------------------------------------------------
-- weekly_menu (recurring template keyed by Persian weekday, 0 = Saturday)
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_menu (
  weekday smallint primary key check (weekday between 0 and 6),
  main_dish text not null,
  side_or_drink text,
  tag text,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on column public.weekly_menu.weekday is
  '0 = Saturday .. 6 = Friday (Persian week).';

-- ---------------------------------------------------------------------------
-- menu_overrides (per-date menu or service closure)
-- ---------------------------------------------------------------------------
create table if not exists public.menu_overrides (
  service_date date primary key,
  main_dish text,
  side_or_drink text,
  tag text,
  is_closed boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint menu_overrides_menu_required
    check (is_closed or main_dish is not null)
);

comment on table public.menu_overrides is
  'Per-date menu overrides. A row wins over weekly_menu; is_closed disables the day.';

-- ---------------------------------------------------------------------------
-- lunch_reservations
-- ---------------------------------------------------------------------------
create table if not exists public.lunch_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service_date date not null,
  price_irt bigint not null default 0 check (price_irt >= 0),
  created_at timestamptz not null default now(),
  constraint lunch_reservations_user_date_key unique (user_id, service_date)
);

create index if not exists lunch_reservations_service_date_idx
  on public.lunch_reservations (service_date);

comment on column public.lunch_reservations.price_irt is
  'Price snapshot taken when the reservation was created.';
