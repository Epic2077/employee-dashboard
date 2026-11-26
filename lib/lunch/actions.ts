"use server";

import { revalidatePath } from "next/cache";

import { requireCapability } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type ReservationActionResult =
  | { ok: true }
  | { ok: false; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function mapReservationError(error: { code?: string; message: string }) {
  if (error.code === "23505" || error.message.includes("duplicate key")) {
    return "این روز قبلاً رزرو شده است.";
  }
  if (
    error.code === "42501" ||
    error.message.includes("reservation_not_allowed") ||
    error.message.includes("row-level security")
  ) {
    return "امکان رزرو یا لغو این روز وجود ندارد.";
  }
  return "خطا در ثبت رزرو. لطفاً دوباره تلاش کنید.";
}

export async function toggleReservation(input: {
  serviceDate: string;
  reserve: boolean;
}): Promise<ReservationActionResult> {
  if (!ISO_DATE.test(input.serviceDate)) {
    return { ok: false, message: "تاریخ انتخاب‌شده معتبر نیست." };
  }

  const access = await requireCapability("lunch.view");
  const supabase = await createClient();

  if (input.reserve) {
    const { error } = await supabase.from("lunch_reservations").insert({
      user_id: access.userId,
      service_date: input.serviceDate,
    });

    if (error) {
      return { ok: false, message: mapReservationError(error) };
    }
  } else {
    const { error } = await supabase
      .from("lunch_reservations")
      .delete()
      .eq("user_id", access.userId)
      .eq("service_date", input.serviceDate);

    if (error) {
      return { ok: false, message: mapReservationError(error) };
    }
  }

  revalidatePath("/");
  return { ok: true };
}
