"use server";

import { revalidatePath } from "next/cache";

import {
  getPersianDaysInMonth,
  toIsoServiceDate,
} from "@/components/shared/persian-calendar";
import type { AdminFormState } from "@/lib/admin/types";
import { requireFullCapability } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function field(formData: FormData, name: string, maxLength = 160): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, maxLength);
}

function refreshAll() {
  revalidatePath("/admin/menu");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function saveServiceSettings(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("menu.manage");

  const price = Number(formData.get("price_per_day_irt"));
  const minLead = Number(formData.get("min_lead_days"));
  const maxAdvance = Number(formData.get("max_advance_days"));

  if (!Number.isFinite(price) || price <= 0) {
    return { error: "قیمت هر وعده باید بزرگ‌تر از صفر باشد." };
  }
  if (!Number.isInteger(minLead) || minLead < 0 || minLead > 60) {
    return { error: "حداقل مهلت رزرو باید بین ۰ تا ۶۰ روز باشد." };
  }
  if (!Number.isInteger(maxAdvance) || maxAdvance < 1 || maxAdvance > 120) {
    return { error: "حداکثر بازه رزرو باید بین ۱ تا ۱۲۰ روز باشد." };
  }
  if (maxAdvance < minLead) {
    return { error: "حداکثر بازه نباید کمتر از حداقل مهلت باشد." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      price_per_day_irt: Math.round(price),
      min_lead_days: minLead,
      max_advance_days: maxAdvance,
    })
    .eq("id", 1);

  if (error) {
    console.error("saveServiceSettings failed", error);
    return { error: "ذخیره تنظیمات انجام نشد. دسترسی یا اتصال را بررسی کنید." };
  }

  refreshAll();
  return { ok: "تنظیمات ذخیره شد." };
}

export async function saveWeeklyMenuItem(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("menu.manage");

  const weekday = Number(formData.get("weekday"));
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { error: "روز هفته نامعتبر است." };
  }

  const mainDish = field(formData, "main_dish");
  if (!mainDish) {
    return { error: "نام غذای اصلی الزامی است." };
  }

  const isEnabled = formData.get("is_enabled") === "on";
  const sideOrDrink = field(formData, "side_or_drink");
  const tag = field(formData, "tag", 40);

  const supabase = await createClient();
  const { error } = await supabase.from("weekly_menu").upsert(
    {
      weekday,
      main_dish: mainDish,
      side_or_drink: sideOrDrink || null,
      tag: tag || null,
      is_enabled: isEnabled,
    },
    { onConflict: "weekday" },
  );

  if (error) {
    console.error("saveWeeklyMenuItem failed", error);
    return { error: "ذخیره منوی هفتگی انجام نشد." };
  }

  refreshAll();
  return { ok: "منوی روز ذخیره شد." };
}

export async function saveMenuOverride(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("menu.manage");

  const existingDate = field(formData, "service_date", 10);
  let isoDate: string;

  if (existingDate) {
    if (!ISO_DATE.test(existingDate)) {
      return { error: "تاریخ نامعتبر است." };
    }
    isoDate = existingDate;
  } else {
    const year = Number(formData.get("year"));
    const month = Number(formData.get("month"));
    const day = Number(formData.get("day"));

    if (!Number.isInteger(year) || year < 1300 || year > 1500) {
      return { error: "سال نامعتبر است." };
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { error: "ماه نامعتبر است." };
    }
    if (
      !Number.isInteger(day) ||
      day < 1 ||
      day > getPersianDaysInMonth(year, month)
    ) {
      return { error: "روز انتخاب‌شده در این ماه وجود ندارد." };
    }

    isoDate = toIsoServiceDate(year, month, day);
  }

  const isClosed = formData.get("is_closed") === "on";
  const mainDish = field(formData, "main_dish");

  if (!isClosed && !mainDish) {
    return { error: "برای روز باز، نام غذای اصلی الزامی است." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("menu_overrides").upsert(
    {
      service_date: isoDate,
      main_dish: isClosed ? null : mainDish,
      side_or_drink: field(formData, "side_or_drink") || null,
      tag: field(formData, "tag", 40) || null,
      is_closed: isClosed,
    },
    { onConflict: "service_date" },
  );

  if (error) {
    console.error("saveMenuOverride failed", error);
    return { error: "ذخیره استثنای تاریخ انجام نشد." };
  }

  refreshAll();
  return { ok: "استثنای تاریخ ذخیره شد." };
}

export async function deleteMenuOverride(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("menu.manage");

  const serviceDate = field(formData, "service_date", 10);
  if (!ISO_DATE.test(serviceDate)) {
    return { error: "تاریخ نامعتبر است." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_overrides")
    .delete()
    .eq("service_date", serviceDate);

  if (error) {
    console.error("deleteMenuOverride failed", error);
    return { error: "حذف استثنا انجام نشد." };
  }

  refreshAll();
  return { ok: "استثنا حذف شد." };
}
