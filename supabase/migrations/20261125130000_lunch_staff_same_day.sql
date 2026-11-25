-- The lunch manager works on the current day's list, so their bookings may be
-- same-day. Employees keep the min_lead_days window (tomorrow onward).

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

revoke all on function public.can_manage_reservation_day(date) from public;
revoke all on function public.can_manage_reservation_day(date) from anon;
grant execute on function public.can_manage_reservation_day(date) to authenticated;

-- Self-bookings keep the lead-time rule; staff bookings may land on today.
create or replace function public.set_reservation_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id = (select auth.uid()) then
    if not public.can_reserve(new.service_date) then
      raise exception 'reservation_not_allowed'
        using errcode = 'P0001',
              hint = 'The date is outside the booking window or unavailable.';
    end if;
  elsif public.has_full_capability('lunch.manage') then
    if not public.can_manage_reservation_day(new.service_date) then
      raise exception 'reservation_not_allowed'
        using errcode = 'P0001',
              hint = 'The date is outside the booking window or unavailable.';
    end if;
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

revoke all on function public.set_reservation_price() from public;
revoke all on function public.set_reservation_price() from anon;
revoke all on function public.set_reservation_price() from authenticated;

drop policy if exists "reservations_insert_staff" on public.lunch_reservations;
create policy "reservations_insert_staff"
on public.lunch_reservations for insert to authenticated
with check (
  public.has_full_capability('lunch.manage')
  and public.can_manage_reservation_day(service_date)
);
