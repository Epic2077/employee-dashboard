import "server-only";

import {
  PERSIAN_WEEKDAYS,
  getTodayIsoDate,
} from "@/components/shared/persian-calendar";
import { requireFullCapability } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type WeeklyMenuAdminRow = {
  weekday: number;
  weekdayName: string;
  mainDish: string;
  sideOrDrink: string;
  tag: string;
  isEnabled: boolean;
  exists: boolean;
};

export type OverrideAdminRow = {
  serviceDate: string;
  mainDish: string;
  sideOrDrink: string;
  tag: string;
  isClosed: boolean;
};

export type MenuAdminData = {
  pricePerDayIrt: number;
  minLeadDays: number;
  maxAdvanceDays: number;
  weekly: WeeklyMenuAdminRow[];
  overrides: OverrideAdminRow[];
  todayIso: string;
};

export async function getMenuAdminData(): Promise<MenuAdminData> {
  await requireFullCapability("menu.manage");

  const supabase = await createClient();
  const [settingsResult, weeklyResult, overridesResult] = await Promise.all([
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
      .order("service_date", { ascending: true }),
  ]);

  const firstError =
    settingsResult.error ?? weeklyResult.error ?? overridesResult.error;
  if (firstError) {
    throw new Error(`Failed to load menu settings: ${firstError.message}`);
  }

  const weeklyByDay = new Map(
    (weeklyResult.data ?? []).map((row) => [row.weekday, row]),
  );

  const weekly: WeeklyMenuAdminRow[] = PERSIAN_WEEKDAYS.map((meta) => {
    const row = weeklyByDay.get(meta.index);
    return {
      weekday: meta.index,
      weekdayName: meta.full,
      mainDish: row?.main_dish ?? "",
      sideOrDrink: row?.side_or_drink ?? "",
      tag: row?.tag ?? "",
      isEnabled: row?.is_enabled ?? !meta.isFriday,
      exists: Boolean(row),
    };
  });

  return {
    pricePerDayIrt: settingsResult.data?.price_per_day_irt ?? 100_000,
    minLeadDays: settingsResult.data?.min_lead_days ?? 1,
    maxAdvanceDays: settingsResult.data?.max_advance_days ?? 14,
    weekly,
    overrides: (overridesResult.data ?? []).map((row) => ({
      serviceDate: row.service_date,
      mainDish: row.main_dish ?? "",
      sideOrDrink: row.side_or_drink ?? "",
      tag: row.tag ?? "",
      isClosed: row.is_closed,
    })),
    todayIso: getTodayIsoDate(),
  };
}
