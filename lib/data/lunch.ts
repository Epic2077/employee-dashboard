import "server-only";

import {
  addDaysToIsoDate,
  getPersianDaysInMonth,
  getPersianMonthYearTitle,
  getTodayIsoDate,
  toIsoServiceDate,
  type DailyMeal,
} from "@/components/shared/persian-calendar";
import { requireCapability } from "@/lib/auth/permissions";
import type { LunchMonthData } from "@/lib/lunch/types";
import { createClient } from "@/lib/supabase/server";

type MenuFields = {
  main_dish: string | null;
  side_or_drink: string | null;
  tag: string | null;
};

function toDailyMeal(row: MenuFields): DailyMeal {
  return {
    mainDish: row.main_dish ?? "",
    sideOrDrink: row.side_or_drink ?? "",
    tag: row.tag ?? undefined,
  };
}

export async function getLunchMonth({
  year,
  month,
}: {
  year: number;
  month: number;
}): Promise<LunchMonthData> {
  const access = await requireCapability("lunch.view");
  const supabase = await createClient();

  const firstIso = toIsoServiceDate(year, month, 1);
  const lastIso = toIsoServiceDate(
    year,
    month,
    getPersianDaysInMonth(year, month),
  );

  const [settingsResult, weeklyResult, overridesResult, reservationsResult] =
    await Promise.all([
      supabase
        .from("app_settings")
        .select("price_per_day_irt, min_lead_days, max_advance_days")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("weekly_menu")
        .select("weekday, main_dish, side_or_drink, tag, is_enabled"),
      supabase
        .from("menu_overrides")
        .select("service_date, main_dish, side_or_drink, tag, is_closed")
        .gte("service_date", firstIso)
        .lte("service_date", lastIso),
      supabase
        .from("lunch_reservations")
        .select("service_date")
        .eq("user_id", access.userId)
        .gte("service_date", firstIso)
        .lte("service_date", lastIso),
    ]);

  const firstError =
    settingsResult.error ??
    weeklyResult.error ??
    overridesResult.error ??
    reservationsResult.error;
  if (firstError) {
    throw new Error(`Failed to load lunch data: ${firstError.message}`);
  }

  const settings = settingsResult.data;
  const minLeadDays = settings?.min_lead_days ?? 1;
  const maxAdvanceDays = settings?.max_advance_days ?? 14;
  const today = getTodayIsoDate();

  const weeklyMenu: Record<number, DailyMeal> = {};
  for (const row of weeklyResult.data ?? []) {
    if (row.is_enabled) {
      weeklyMenu[row.weekday] = toDailyMeal(row);
    }
  }

  const overrides: Record<string, DailyMeal> = {};
  const closedDates: string[] = [];
  for (const row of overridesResult.data ?? []) {
    if (row.is_closed) {
      closedDates.push(row.service_date);
    } else {
      overrides[row.service_date] = toDailyMeal(row);
    }
  }

  return {
    year,
    month,
    monthTitle: getPersianMonthYearTitle(year, month),
    pricePerDayIrt: settings?.price_per_day_irt ?? 0,
    weeklyMenu,
    overrides,
    closedDates,
    reservedDates: (reservationsResult.data ?? []).map(
      (row) => row.service_date,
    ),
    window: {
      today,
      from: addDaysToIsoDate(today, minLeadDays),
      to: addDaysToIsoDate(today, maxAdvanceDays),
    },
  };
}
