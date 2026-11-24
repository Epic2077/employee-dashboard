-- The person responsible for lunch can see the day's list and reserve (or
-- cancel) food for any employee, using the lunch.manage capability.

-- Keep the booking window enforced for staff bookings made on behalf of
-- someone else; service-role imports stay exempt.
create or replace function public.set_reservation_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
      new.user_id = (select auth.uid())
      or public.has_full_capability('lunch.manage')
    )
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

revoke all on function public.set_reservation_price() from public;
revoke all on function public.set_reservation_price() from anon;
revoke all on function public.set_reservation_price() from authenticated;

drop policy if exists "reservations_insert_staff" on public.lunch_reservations;
create policy "reservations_insert_staff"
on public.lunch_reservations for insert to authenticated
with check (
  public.has_full_capability('lunch.manage')
  and public.can_reserve(service_date)
);

drop policy if exists "reservations_delete_staff" on public.lunch_reservations;
create policy "reservations_delete_staff"
on public.lunch_reservations for delete to authenticated
using (public.has_full_capability('lunch.manage'));
