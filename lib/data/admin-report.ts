import "server-only";

import {
  PERSIAN_WEEKDAYS,
  getPersianDaysInMonth,
  getPersianMonthYearTitle,
  getPersianStartWeekdayIndex,
  toIsoServiceDate,
} from "@/components/shared/persian-calendar";
import { requireCapability } from "@/lib/auth/permissions";
import type { Scope } from "@/lib/auth/permissions";
import type { ProfileRole } from "@/lib/supabase/models";
import { createClient } from "@/lib/supabase/server";
import {
  departmentOptions,
  filterVisibleProfiles,
  matchesDepartment,
} from "@/lib/data/scope";
import { fetchScopedProfiles } from "@/lib/data/profiles";

export type DayReport = {
  isoDate: string;
  dayOfMonth: number;
  weekdayName: string;
  isFriday: boolean;
  dish: string | null;
  reservedCount: number;
  cost: number;
};

export type EmployeeReport = {
  userId: string;
  name: string;
  department: string | null;
  role: ProfileRole;
  days: number;
  cost: number;
};

export type LunchReport = {
  year: number;
  month: number;
  monthTitle: string;
  totalReservations: number;
  totalCost: number;
  distinctEmployees: number;
  activeProfiles: number;
  perDay: DayReport[];
  perEmployee: EmployeeReport[];
  /** Effective scope of the viewer for this report. */
  scope: Scope;
  /** Department options available in the filter. */
  departments: string[];
  /** Currently selected department filter (null = all). */
  department: string | null;
};

export async function getLunchReport({
  year,
  month,
  department = null,
}: {
  year: number;
  month: number;
  department?: string | null;
}): Promise<LunchReport> {
  const access = await requireCapability("reports.lunch");
  const scope = access.scopes["reports.lunch"];

  const supabase = await createClient();
  const daysInMonth = getPersianDaysInMonth(year, month);
  const firstIso = toIsoServiceDate(year, month, 1);
  const lastIso = toIsoServiceDate(year, month, daysInMonth);

  const allProfiles = await fetchScopedProfiles(supabase);
  const scopedProfiles = filterVisibleProfiles(allProfiles, access, scope);
  const departments = departmentOptions(scopedProfiles);
  const selectedDepartment =
    department && department.trim() ? department.trim() : null;
  const profiles = selectedDepartment
    ? scopedProfiles.filter((profile) =>
        matchesDepartment(profile, selectedDepartment),
      )
    : scopedProfiles;

  const visibleIds = profiles.map((profile) => profile.id);
  const isGlobal = scope === "all" && !selectedDepartment;

  let reservations: {
    user_id: string;
    service_date: string;
    price_irt: number;
  }[] = [];

  if (isGlobal || visibleIds.length > 0) {
    let reservationsQuery = supabase
      .from("lunch_reservations")
      .select("user_id, service_date, price_irt")
      .gte("service_date", firstIso)
      .lte("service_date", lastIso);

    if (!isGlobal) {
      reservationsQuery = reservationsQuery.in("user_id", visibleIds);
    }

    const result = await reservationsQuery;
    if (result.error) {
      throw new Error(`Failed to load lunch report: ${result.error.message}`);
    }
    reservations = result.data ?? [];
  }

  const [weeklyResult, overridesResult] = await Promise.all([
    supabase.from("weekly_menu").select("weekday, main_dish, is_enabled"),
    supabase
      .from("menu_overrides")
      .select("service_date, main_dish, is_closed")
      .gte("service_date", firstIso)
      .lte("service_date", lastIso),
  ]);

  const firstError = weeklyResult.error ?? overridesResult.error;
  if (firstError) {
    throw new Error(`Failed to load lunch report: ${firstError.message}`);
  }

  const byDate = new Map<string, { count: number; cost: number }>();
  const byEmployee = new Map<string, { days: number; cost: number }>();

  for (const reservation of reservations) {
    const dateEntry = byDate.get(reservation.service_date) ?? {
      count: 0,
      cost: 0,
    };
    dateEntry.count += 1;
    dateEntry.cost += reservation.price_irt;
    byDate.set(reservation.service_date, dateEntry);

    const employeeEntry = byEmployee.get(reservation.user_id) ?? {
      days: 0,
      cost: 0,
    };
    employeeEntry.days += 1;
    employeeEntry.cost += reservation.price_irt;
    byEmployee.set(reservation.user_id, employeeEntry);
  }

  const weeklyDishes = new Map<number, string>();
  for (const row of weeklyResult.data ?? []) {
    if (row.is_enabled) {
      weeklyDishes.set(row.weekday, row.main_dish);
    }
  }

  const overrideDishes = new Map<string, string>();
  for (const row of overridesResult.data ?? []) {
    if (!row.is_closed && row.main_dish) {
      overrideDishes.set(row.service_date, row.main_dish);
    }
  }

  const startWeekday = getPersianStartWeekdayIndex(year, month);
  const perDay: DayReport[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const weekdayIndex = (startWeekday + day - 1) % 7;
    const weekdayMeta = PERSIAN_WEEKDAYS[weekdayIndex];
    const isoDate = toIsoServiceDate(year, month, day);
    const stats = byDate.get(isoDate);

    perDay.push({
      isoDate,
      dayOfMonth: day,
      weekdayName: weekdayMeta.full,
      isFriday: weekdayMeta.isFriday,
      dish:
        overrideDishes.get(isoDate) ?? weeklyDishes.get(weekdayIndex) ?? null,
      reservedCount: stats?.count ?? 0,
      cost: stats?.cost ?? 0,
    });
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const perEmployee: EmployeeReport[] = [...byEmployee.entries()]
    .map(([userId, totals]) => {
      const profile = profileById.get(userId);
      return {
        userId,
        name: profile?.full_name ?? "کاربر حذف‌شده",
        department: profile?.department ?? null,
        role: profile?.role ?? "employee",
        days: totals.days,
        cost: totals.cost,
      };
    })
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, "fa"));

  return {
    year,
    month,
    monthTitle: getPersianMonthYearTitle(year, month),
    totalReservations: reservations.length,
    totalCost: reservations.reduce((sum, row) => sum + row.price_irt, 0),
    distinctEmployees: byEmployee.size,
    activeProfiles: profiles.filter((profile) => profile.is_active).length,
    perDay,
    perEmployee,
    scope,
    departments,
    department: selectedDepartment,
  };
}
