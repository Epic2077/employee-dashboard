"use server";

import { revalidatePath } from "next/cache";

import { getTodayIsoDate } from "@/components/shared/persian-calendar";
import { requireCapability } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type ServicesActionResult =
  | { ok: true }
  | { ok: false; message: string };

function mapServiceError(error: { code?: string; message: string }) {
  if (error.message.includes("service_quantity_out_of_range")) {
    return "تعداد انتخاب‌شده از سقف روزانه بیشتر است.";
  }
  if (error.message.includes("service_order_not_today")) {
    return "سفارش فقط برای امروز ثبت می‌شود.";
  }
  if (error.message.includes("service_inactive")) {
    return "این سرویس در حال حاضر غیرفعال است.";
  }
  if (error.message.includes("service_category_denied")) {
    return "دسترسی شما به این دسته از سرویس‌ها محدود شده است.";
  }
  if (error.message.includes("service_not_found")) {
    return "این سرویس پیدا نشد.";
  }
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message.includes("does not exist") ||
    error.message.includes("schema cache")
  ) {
    return "سرویس‌های رفاهی هنوز روی دیتابیس فعال نشده‌اند.";
  }
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return "امکان ثبت این سفارش وجود ندارد.";
  }
  return "ثبت سفارش انجام نشد. دوباره تلاش کنید.";
}

export async function setServiceQuantity(input: {
  serviceId: string;
  quantity: number;
}): Promise<ServicesActionResult> {
  const access = await requireCapability("services.view");

  const serviceId = String(input.serviceId ?? "").trim();
  const quantity = Math.trunc(Number(input.quantity));

  if (!serviceId) {
    return { ok: false, message: "سرویس نامعتبر است." };
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, message: "تعداد انتخاب‌شده معتبر نیست." };
  }

  const supabase = await createClient();
  const todayIso = getTodayIsoDate();

  if (quantity === 0) {
    const { error } = await supabase
      .from("service_orders")
      .delete()
      .eq("user_id", access.userId)
      .eq("service_id", serviceId)
      .eq("service_date", todayIso);

    if (error) {
      return { ok: false, message: mapServiceError(error) };
    }
  } else {
    const { error } = await supabase.from("service_orders").upsert(
      {
        user_id: access.userId,
        service_id: serviceId,
        service_date: todayIso,
        quantity,
      },
      { onConflict: "user_id,service_id,service_date" },
    );

    if (error) {
      return { ok: false, message: mapServiceError(error) };
    }
  }

  revalidatePath("/");
  revalidatePath("/admin/services");
  return { ok: true };
}
