-- Lunch guests: extra meals for people without an account (visitors,
-- contractors, guests of the team) can be added to a specific service day by
-- whoever manages lunch.

create table if not exists public.lunch_guests (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  note text,
  price_irt bigint not null default 0 check (price_irt >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lunch_guests_service_date_idx
  on public.lunch_guests (service_date);

-- Same person should not be added twice to the same day.
create unique index if not exists lunch_guests_date_name_key
  on public.lunch_guests (service_date, lower(btrim(name)));

comment on table public.lunch_guests is
  'Extra meals for people without an account, attached to one service day.';
comment on column public.lunch_guests.price_irt is
  'Price snapshot; 0 means "use the current daily price".';

alter table public.lunch_guests enable row level security;

revoke all on table public.lunch_guests from anon;
grant select, insert, delete on table public.lunch_guests to authenticated;

-- Anyone who can open a day's lunch list can see its guests.
drop policy if exists "lunch_guests_select_staff" on public.lunch_guests;
create policy "lunch_guests_select_staff"
on public.lunch_guests for select to authenticated
using (public.has_capability('reports.lunch'));

-- Only lunch managers may add a guest, and only for a serviceable day.
-- Same-day is allowed on purpose: guests usually show up last minute.
drop policy if exists "lunch_guests_insert_staff" on public.lunch_guests;
create policy "lunch_guests_insert_staff"
on public.lunch_guests for insert to authenticated
with check (
  public.has_full_capability('lunch.manage')
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

drop policy if exists "lunch_guests_delete_staff" on public.lunch_guests;
create policy "lunch_guests_delete_staff"
on public.lunch_guests for delete to authenticated
using (public.has_full_capability('lunch.manage'));
