-- Company-provided services (coffee today, tea/others later).
-- Replaces the coffee-only tables with a catalogue + generic daily orders.

-- ---------------------------------------------------------------------------
-- 1. catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9-]{2,32}$'),
  name text not null
    check (char_length(btrim(name)) between 2 and 40),
  unit_label text not null default 'عدد'
    check (char_length(btrim(unit_label)) between 1 and 20),
  description text,
  price_irt integer not null default 0 check (price_irt >= 0),
  max_per_day smallint not null default 3
    check (max_per_day between 1 and 20),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.services is
  'Everything the company provides to employees (coffee, tea, …).';

-- ---------------------------------------------------------------------------
-- 2. daily orders
-- ---------------------------------------------------------------------------
create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  service_date date not null,
  quantity smallint not null check (quantity > 0),
  unit_price_irt integer not null default 0 check (unit_price_irt >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, service_id, service_date)
);

create index if not exists service_orders_date_idx
  on public.service_orders (service_date);
create index if not exists service_orders_service_idx
  on public.service_orders (service_id, service_date);
create index if not exists service_orders_user_idx
  on public.service_orders (user_id, service_date);

comment on table public.service_orders is
  'One row per employee, service and day. Price is snapshotted per unit.';

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

  -- Never trust a client-supplied price.
  new.unit_price_irt := v_service.price_irt;
  return new;
end;
$$;

drop trigger if exists service_orders_prepare on public.service_orders;
create trigger service_orders_prepare
before insert or update on public.service_orders
for each row execute function public.prepare_service_order();

drop trigger if exists services_touch_updated_at on public.services;
create trigger services_touch_updated_at
before update on public.services
for each row execute function public.touch_updated_at();

drop trigger if exists service_orders_touch_updated_at on public.service_orders;
create trigger service_orders_touch_updated_at
before update on public.service_orders
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.service_orders enable row level security;

revoke all on table public.services from anon;
revoke all on table public.service_orders from anon;

grant select, insert, update, delete on table public.services
  to authenticated;
grant select, insert, update, delete on table public.service_orders
  to authenticated;

drop policy if exists "services_select_authenticated" on public.services;
create policy "services_select_authenticated"
on public.services for select to authenticated using (true);

drop policy if exists "services_write_manager" on public.services;
create policy "services_write_manager"
on public.services for all to authenticated
using (public.has_full_capability('services.manage'))
with check (public.has_full_capability('services.manage'));

drop policy if exists "service_orders_select_scoped" on public.service_orders;
create policy "service_orders_select_scoped"
on public.service_orders for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_view_user(user_id, 'reports.services')
);

drop policy if exists "service_orders_insert_self" on public.service_orders;
create policy "service_orders_insert_self"
on public.service_orders for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "service_orders_update_self" on public.service_orders;
create policy "service_orders_update_self"
on public.service_orders for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "service_orders_delete_self" on public.service_orders;
create policy "service_orders_delete_self"
on public.service_orders for delete to authenticated
using (
  user_id = (select auth.uid())
  or public.has_full_capability('services.manage')
);

-- ---------------------------------------------------------------------------
-- 4. seed coffee + migrate the old coffee data
-- ---------------------------------------------------------------------------
do $$
declare
  v_price integer := 40000;
  v_max smallint := 3;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'coffee_price_per_shot_irt'
  ) then
    execute
      'select coffee_price_per_shot_irt, coffee_max_shots_per_day
         from public.app_settings where id = 1'
      into v_price, v_max;
  end if;

  insert into public.services (
    slug, name, unit_label, description, price_irt, max_per_day, sort_order
  )
  values (
    'coffee',
    'قهوه',
    'شات',
    'قهوه روزانه کارکنان',
    coalesce(v_price, 40000),
    coalesce(v_max, 3),
    10
  )
  on conflict (slug) do nothing;
end
$$;

do $$
begin
  if to_regclass('public.coffee_orders') is not null then
    insert into public.service_orders (
      user_id, service_id, service_date, quantity, unit_price_irt
    )
    select
      o.user_id,
      s.id,
      o.service_date,
      o.shots,
      o.price_per_shot_irt
    from public.coffee_orders o
    cross join public.services s
    where s.slug = 'coffee'
      and o.shots > 0
    on conflict (user_id, service_id, service_date) do nothing;

    drop table public.coffee_orders;
  end if;
end
$$;

-- The coffee columns on app_settings are superseded by services but kept so an
-- older deployment can still read them; nothing in the app writes them anymore.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'coffee_price_per_shot_irt'
  ) then
    comment on column public.app_settings.coffee_price_per_shot_irt is
      'Legacy: coffee price now lives in public.services. Read-only.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'coffee_max_shots_per_day'
  ) then
    comment on column public.app_settings.coffee_max_shots_per_day is
      'Legacy: coffee daily cap now lives in public.services. Read-only.';
  end if;
end
$$;
