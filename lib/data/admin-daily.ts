import "server-only";

import {
  PERSIAN_WEEKDAYS,
  addDaysToIsoDate,
  formatLongPersianDate,
  getPersianMonthName,
  getPersianPartsFromIso,
  getTodayIsoDate,
  getWeekdayIndexFromIso,
} from "@/components/shared/persian-calendar";
import { requireCapability } from "@/lib/auth/permissions";
import type { Scope } from "@/lib/auth/scopes";
import { fetchScopedProfiles } from "@/lib/data/profiles";
import { filterVisibleProfiles } from "@/lib/data/scope";
import type { ProfileRole } from "@/lib/supabase/models";
import { createClient } from "@/lib/supabase/server";

export type DailyEmployee = {
  userId: string;
  name: string;
  employeeCode: string | null;
  department: string | null;
  role: ProfileRole;
  reservationId: string | null;
  priceIrt: number | null;
};

export type DailyOption = {
  isoDate: string;
  label: string;
  shortLabel: string;
  weekdayName: string;
  isOpen: boolean;
  dish: string | null;
};

export type DailyList = {
  isoDate: string;
  label: string;
  weekdayName: string;
  dish: string | null;
  isOpen: boolean;
  canManage: boolean;
  scope: Scope;
  priceIrt: number;
  employees: DailyEmployee[];
  reserved: number;
  totalCost: number;
  options: DailyOption[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function persianLabel(isoDate: string): string {
  const parts = getPersianPartsFromIso(isoDate);
  return formatLongPersianDate(
    parts.year,
    parts.month,
    parts.day,
    getWeekdayIndexFromIso(isoDate),
  );
}

/** "4 آذر" — the date part without the weekday. */
function persianShortLabel(isoDate: string): string {
  const parts = getPersianPartsFromIso(isoDate);
  return `${parts.day} ${getPersianMonthName(parts.year, parts.month)}`;
}

/**
 * One day's lunch list plus the days that can still be booked, so the person
 * responsible for lunch can see who is eating and add/remove people.
 */
export async function getDailyList({
  date = null,
}: {
  date?: string | null;
} = {}): Promise<DailyList> {
  const access = await requireCapability("reports.lunch");
  const scope = access.scopes["reports.lunch"];
  const supabase = await createClient();

  const todayIso = getTodayIsoDate();

  const [settingsResult, profiles, weeklyResult] = await Promise.all([
    supabase
      .from("app_settings")
      .select("price_per_day_irt, min_lead_days, max_advance_days")
      .eq("id", 1)
      .maybeSingle(),
    fetchScopedProfiles(supabase),
    supabase.from("weekly_menu").select("weekday, main_dish, is_enabled"),
  ]);

  const settings = settingsResult.data;
  const minLead = settings?.min_lead_days ?? 1;
  const maxAdvance = settings?.max_advance_days ?? 14;
  const priceIrt = settings?.price_per_day_irt ?? 100_000;
  const windowStart = addDaysToIsoDate(todayIso, minLead);
  const windowEnd = addDaysToIsoDate(todayIso, maxAdvance);

  const overridesResult = await supabase
    .from("menu_overrides")
    .select("service_date, main_dish, is_closed")
    .gte("service_date", windowStart)
    .lte("service_date", windowEnd);

  const weeklyDishes = new Map<number, string>();
  for (const row of weeklyResult.data ?? []) {
    if (row.is_enabled) {
      weeklyDishes.set(row.weekday, row.main_dish);
    }
  }

  const overrideByDate = new Map(
    (overridesResult.data ?? []).map((row) => [row.service_date, row]),
  );

  const options: DailyOption[] = [];
  for (
    let iso = windowStart;
    iso <= windowEnd;
    iso = addDaysToIsoDate(iso, 1)
  ) {
    const weekdayIndex = getWeekdayIndexFromIso(iso);
    const weekdayMeta = PERSIAN_WEEKDAYS[weekdayIndex];
    const override = overrideByDate.get(iso);
    const dish = override?.main_dish ?? weeklyDishes.get(weekdayIndex) ?? null;
    const isOpen =
      !weekdayMeta.isFriday &&
      !override?.is_closed &&
      (Boolean(override) || Boolean(dish));

    options.push({
      isoDate: iso,
      label: persianLabel(iso),
      shortLabel: persianShortLabel(iso),
      weekdayName: weekdayMeta.full,
      isOpen,
      dish,
    });
  }

  const requested = date && ISO_DATE.test(date) ? date : null;
  const selected =
    options.find((option) => option.isoDate === requested) ??
    options.find((option) => option.isOpen) ??
    options[0];

  const isoDate = selected?.isoDate ?? todayIso;

  const visibleProfiles = filterVisibleProfiles(profiles, access, scope).filter(
    (profile) => profile.is_active,
  );

  const reservationsResult = await supabase
    .from("lunch_reservations")
    .select("id, user_id, price_irt")
    .eq("service_date", isoDate);

  const reservations = reservationsResult.error
    ? []
    : (reservationsResult.data ?? []);
  const byUser = new Map(reservations.map((row) => [row.user_id, row]));

  const employees: DailyEmployee[] = visibleProfiles
    .map((profile) => {
      const reservation = byUser.get(profile.id);
      return {
        userId: profile.id,
        name: profile.full_name,
        employeeCode: profile.employee_code,
        department: profile.department,
        role: profile.role,
        reservationId: reservation?.id ?? null,
        priceIrt: reservation?.price_irt ?? null,
      };
    })
    .sort((a, b) => {
      if (Boolean(a.reservationId) !== Boolean(b.reservationId)) {
        return a.reservationId ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "fa");
    });

  const reserved = employees.filter((employee) => employee.reservationId);

  return {
    isoDate,
    label: selected?.label ?? persianLabel(isoDate),
    weekdayName: selected?.weekdayName ?? "",
    dish: selected?.dish ?? null,
    isOpen: selected?.isOpen ?? false,
    canManage: access.scopes["lunch.manage"] === "all",
    scope,
    priceIrt,
    employees,
    reserved: reserved.length,
    totalCost: reserved.reduce(
      (sum, employee) => sum + (employee.priceIrt ?? priceIrt),
      0,
    ),
    options,
  };
}
