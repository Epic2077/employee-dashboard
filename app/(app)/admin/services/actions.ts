"use server";

import { revalidatePath } from "next/cache";

import { isMissingRelation } from "@/lib/data/errors";
import { requireFullCapability } from "@/lib/auth/permissions";
import type { ServicesFormState } from "@/lib/services/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const SLUG = /^[a-z0-9-]{2,32}$/;

type ServiceInsert = Database["public"]["Tables"]["services"]["Insert"];
type ServicePayload = Omit<ServiceInsert, "id" | "created_at">;

function field(formData: FormData, name: string, maxLength = 160): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, maxLength);
}

function refresh() {
  revalidatePath("/admin/services");
  revalidatePath("/");
}

/** Creates a service when `id` is empty, otherwise updates it. */
export async function saveService(
  _state: ServicesFormState,
  formData: FormData,
): Promise<ServicesFormState> {
  await requireFullCapability("services.manage");

  const id = field(formData, "service_id", 40);
  const name = field(formData, "name", 40);
  const slug = field(formData, "slug", 32).toLowerCase();
  const unitLabel = field(formData, "unit_label", 20);
  const description = field(formData, "description", 200);
  const price = Number(
    String(formData.get("price_irt") ?? "").replace(/,/g, ""),
  );
  const maxPerDay = Number(formData.get("max_per_day"));
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isActive = formData.get("is_active") === "on";
  const categoryId = field(formData, "category_id", 40);

  if (name.length < 2) {
    return { error: "نام سرویس باید حداقل ۲ کاراکتر باشد." };
  }
  if (!SLUG.test(slug)) {
    return {
      error:
        "شناسه انگلیسی سرویس باید ۲ تا ۳۲ کاراکتر و شامل حروف کوچک، عدد یا خط تیره باشد.",
    };
  }
  if (!unitLabel) {
    return { error: "واحد سرویس (مثلاً شات یا لیوان) الزامی است." };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { error: "قیمت هر واحد باید عددی صفر یا بیشتر باشد." };
  }
  if (!Number.isInteger(maxPerDay) || maxPerDay < 1 || maxPerDay > 20) {
    return { error: "سقف روزانه باید بین ۱ تا ۲۰ باشد." };
  }

  const supabase = await createClient();

  if (categoryId) {
    const { data: category } = await supabase
      .from("access_categories")
      .select("id, module")
      .eq("id", categoryId)
      .maybeSingle();

    if (!category || category.module !== "services") {
      return { error: "دسته انتخاب‌شده برای سرویس‌ها معتبر نیست." };
    }
  }

  const payload: ServicePayload = {
    slug,
    name,
    unit_label: unitLabel,
    description: description || null,
    price_irt: Math.round(price),
    max_per_day: maxPerDay,
    is_active: isActive,
    sort_order: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
    category_id: categoryId || null,
  };

  const { error } = id
    ? await supabase.from("services").update(payload).eq("id", id)
    : await supabase.from("services").insert(payload);

  if (error) {
    console.error("saveService failed", error);
    if (isMissingRelation(error)) {
      return { error: "جدول سرویس‌ها روی دیتابیس وجود ندارد." };
    }
    if (error.code === "23505") {
      return { error: "شناسه انگلیسی این سرویس قبلاً استفاده شده است." };
    }
    return { error: "ذخیره سرویس انجام نشد." };
  }

  refresh();
  return { ok: id ? "سرویس ذخیره شد." : `سرویس «${name}» اضافه شد.` };
}

export async function deleteService(
  _state: ServicesFormState,
  formData: FormData,
): Promise<ServicesFormState> {
  await requireFullCapability("services.manage");

  const id = field(formData, "service_id", 40);
  if (!id) {
    return { error: "سرویس نامعتبر است." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("services").delete().eq("id", id);

  if (error) {
    console.error("deleteService failed", error);
    return { error: "حذف سرویس انجام نشد." };
  }

  refresh();
  return { ok: "سرویس و سفارش‌های آن حذف شد." };
}
