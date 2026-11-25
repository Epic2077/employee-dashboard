"use server";

import { revalidatePath } from "next/cache";

import { requireFullCapability } from "@/lib/auth/permissions";
import type { AdminFormState } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function field(formData: FormData, name: string, maxLength = 60): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, maxLength);
}

function refresh() {
  revalidatePath("/admin/daily");
  revalidatePath("/admin");
  revalidatePath("/");
}

function mapReservationError(error: { code?: string; message: string }) {
  if (error.message.includes("reservation_not_allowed")) {
    return "این تاریخ خارج از بازه رزرو یا غیرفعال است.";
  }
  if (error.code === "23505") {
    return "این کارمند قبلاً برای این روز رزرو شده است.";
  }
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return "امکان ثبت این رزرو وجود ندارد.";
  }
  return "ثبت رزرو انجام نشد. دوباره تلاش کنید.";
}

/** Reserve or cancel a lunch reservation on behalf of an employee. */
export async function setDailyReservation(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("lunch.manage");

  const userId = field(formData, "user_id", 40);
  const date = field(formData, "date", 10);
  const action = field(formData, "action", 10);

  if (!userId || !ISO_DATE.test(date)) {
    return { error: "درخواست نامعتبر است." };
  }
  if (action !== "reserve" && action !== "cancel") {
    return { error: "عملیات نامعتبر است." };
  }

  const supabase = await createClient();

  if (action === "reserve") {
    const { error } = await supabase
      .from("lunch_reservations")
      .insert({ user_id: userId, service_date: date });

    if (error) {
      console.error("setDailyReservation insert failed", error);
      return { error: mapReservationError(error) };
    }
  } else {
    const { error } = await supabase
      .from("lunch_reservations")
      .delete()
      .eq("user_id", userId)
      .eq("service_date", date);

    if (error) {
      console.error("setDailyReservation delete failed", error);
      return { error: mapReservationError(error) };
    }
  }

  refresh();
  return {
    ok: action === "reserve" ? "رزرو ثبت شد." : "رزرو لغو شد.",
  };
}

/** Add a guest (a person without an account) to a day's lunch list. */
export async function addDailyGuest(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("lunch.manage");

  const date = field(formData, "date", 10);
  const name = field(formData, "name", 80);
  const note = field(formData, "note", 80) || null;

  if (!ISO_DATE.test(date)) {
    return { error: "درخواست نامعتبر است." };
  }
  if (!name) {
    return { error: "نام مهمان را وارد کنید." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lunch_guests")
    .insert({ service_date: date, name, note });

  if (error) {
    console.error("addDailyGuest insert failed", error);
    if (error.code === "23505") {
      return { error: "این مهمان قبلاً برای این روز ثبت شده است." };
    }
    if (
      error.code === "42501" ||
      error.message.includes("row-level security")
    ) {
      return { error: "امکان افزودن مهمان برای این روز وجود ندارد." };
    }
    if (error.code === "42P01") {
      return {
        error: "جدول مهمان‌ها آماده نیست؛ ابتدا مهاجرت‌ها را اجرا کنید.",
      };
    }
    return { error: "افزودن مهمان انجام نشد. دوباره تلاش کنید." };
  }

  refresh();
  return { ok: `مهمان «${name}» به این روز اضافه شد.` };
}

/** Remove a guest from a day's lunch list. */
export async function removeDailyGuest(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("lunch.manage");

  const id = field(formData, "id", 40);

  if (!id) {
    return { error: "درخواست نامعتبر است." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lunch_guests").delete().eq("id", id);

  if (error) {
    console.error("removeDailyGuest delete failed", error);
    return { error: "حذف مهمان انجام نشد. دوباره تلاش کنید." };
  }

  refresh();
  return { ok: "مهمان حذف شد." };
}
