-- Coffee service: employees order shots for today at a fixed per-shot price.

alter table public.app_settings
  add column if not exists coffee_price_per_shot_irt bigint not null
    default 40000 check (coffee_price_per_shot_irt > 0),
  add column if not exists coffee_max_shots_per_day smallint not null
    default 3 check (coffee_max_shots_per_day between 1 and 10);

create table if not exists public.coffee_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service_date date not null,
  shots smallint not null check (shots between 1 and 10),
  price_per_shot_irt bigint not null default 0
    check (price_per_shot_irt >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coffee_orders_user_date_key unique (user_id, service_date)
);

create index if not exists coffee_orders_service_date_idx
  on public.coffee_orders (service_date);

comment on table public.coffee_orders is
  'One coffee order per employee per day; price is snapshotted per shot.';

-- ---- Booking rules -------------------------------------------------------
create or replace function public.prepare_coffee_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price bigint;
  v_max smallint;
begin
  select coffee_price_per_shot_irt, coffee_max_shots_per_day
    into v_price, v_max
  from public.app_settings
  where id = 1;

  if new.shots is null or new.shots < 1 or new.shots > coalesce(v_max, 3) then
    raise exception 'coffee_shots_out_of_range' using errcode = 'P0001';
  end if;

  -- Employees may only order for today; the service role can backfill.
  if new.user_id = (select auth.uid())
    and new.service_date <> public.today_tehran() then
    raise exception 'coffee_order_not_today' using errcode = 'P0001';
  end if;

  new.price_per_shot_irt := coalesce(v_price, 40000);
  return new;
end;
$$;

revoke all on function public.prepare_coffee_order() from public;
revoke all on function public.prepare_coffee_order() from anon;
revoke all on function public.prepare_coffee_order() from authenticated;

drop trigger if exists coffee_orders_before_write on public.coffee_orders;
create trigger coffee_orders_before_write
before insert or update on public.coffee_orders
for each row execute function public.prepare_coffee_order();

drop trigger if exists coffee_orders_touch_updated_at on public.coffee_orders;
create trigger coffee_orders_touch_updated_at
before update on public.coffee_orders
for each row execute function public.touch_updated_at();

-- ---- Row level security --------------------------------------------------
alter table public.coffee_orders enable row level security;

revoke all on table public.coffee_orders from anon;
grant select, insert, update, delete on table public.coffee_orders
  to authenticated;

drop policy if exists "coffee_select_self_or_staff" on public.coffee_orders;
create policy "coffee_select_self_or_staff"
on public.coffee_orders
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_manager());

drop policy if exists "coffee_insert_self" on public.coffee_orders;
create policy "coffee_insert_self"
on public.coffee_orders
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and service_date = public.today_tehran()
);

drop policy if exists "coffee_update_self" on public.coffee_orders;
create policy "coffee_update_self"
on public.coffee_orders
for update
to authenticated
using (
  user_id = (select auth.uid())
  and service_date = public.today_tehran()
)
with check (
  user_id = (select auth.uid())
  and service_date = public.today_tehran()
);

drop policy if exists "coffee_delete_self" on public.coffee_orders;
create policy "coffee_delete_self"
on public.coffee_orders
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and service_date = public.today_tehran()
);

drop policy if exists "coffee_delete_admin" on public.coffee_orders;
create policy "coffee_delete_admin"
on public.coffee_orders
for delete
to authenticated
using (public.is_admin());
