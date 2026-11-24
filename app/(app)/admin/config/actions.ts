"use server";

import { revalidatePath } from "next/cache";

import type { AdminFormState } from "@/lib/admin/types";
import {
  requireCapability,
  requireFullCapability,
} from "@/lib/auth/permissions";
import { actorCanTarget } from "@/lib/data/digital";
import { isMissingRelation } from "@/lib/data/errors";
import { provisionConfig, revokeConfigById } from "@/lib/digital/provision";
import { createAdminClient } from "@/lib/supabase/admin";

function field(formData: FormData, name: string, maxLength = 80): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, maxLength);
}

function refresh() {
  revalidatePath("/admin/config");
  revalidatePath("/");
}

async function targetProfile(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, department, department_id, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  return data;
}

export async function createConfigForUser(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const access = await requireCapability("digital.manage");

  const userId = field(formData, "user_id", 40);
  const inboundIds = formData
    .getAll("inbound_ids")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));

  if (!userId) {
    return { error: "کارمند را انتخاب کنید." };
  }

  const result = await provisionConfig({
    actor: access,
    targetUserId: userId,
    requestedInboundIds: inboundIds,
    mode: "staff",
  });

  if (!result.ok) {
    return { error: result.message };
  }

  refresh();
  return { ok: `کانفیگ «${result.email}» ساخته شد.` };
}

export async function revokeConfig(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const access = await requireCapability("digital.manage");

  const configId = field(formData, "config_id", 40);
  const userId = field(formData, "user_id", 40);

  if (!configId || !userId) {
    return { error: "درخواست نامعتبر است." };
  }

  const target = await targetProfile(userId);
  if (!target || !(await actorCanTarget(access, target))) {
    return { error: "این کارمند خارج از دسترسی شماست." };
  }

  const result = await revokeConfigById(configId);
  if (!result.ok) {
    return { error: result.message };
  }

  refresh();
  return { ok: "کانفیگ لغو شد." };
}

export async function setQuota(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const access = await requireCapability("digital.manage");

  const userId = field(formData, "user_id", 40);
  const maxConfigs = Number(formData.get("max_configs"));

  if (!userId) {
    return { error: "کارمند را انتخاب کنید." };
  }
  if (!Number.isInteger(maxConfigs) || maxConfigs < 1 || maxConfigs > 99) {
    return { error: "سهمیه باید بین ۱ تا ۹۹ باشد." };
  }

  const target = await targetProfile(userId);
  if (!target || !(await actorCanTarget(access, target))) {
    return { error: "این کارمند خارج از دسترسی شماست." };
  }

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("digital_settings")
    .select("manager_quota_cap")
    .eq("id", 1)
    .maybeSingle();

  const cap =
    access.scopes["digital.manage"] === "all"
      ? 99
      : Math.min(settings?.manager_quota_cap ?? 5, 99);

  if (maxConfigs > cap) {
    return { error: `سهمیه شما حداکثر ${cap} کانفیگ برای هر نفر است.` };
  }

  const { count } = await admin
    .from("v2ray_configs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "revoked");

  if ((count ?? 0) > maxConfigs) {
    return {
      error: `این کاربر الان ${count} کانفیگ فعال دارد؛ سهمیه نمی‌تواند کمتر باشد.`,
    };
  }

  const { error } = await admin.from("v2ray_quotas").upsert(
    {
      user_id: userId,
      max_configs: maxConfigs,
      updated_by: access.userId,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("setQuota failed", error);
    return { error: "ذخیره سهمیه انجام نشد." };
  }

  refresh();
  return { ok: `سهمیه ${target.full_name} روی ${maxConfigs} کانفیگ ثبت شد.` };
}

export async function saveDigitalSettings(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("digital.manage");

  const defaultInboundIds = formData
    .getAll("default_inbound_ids")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
  const selfServiceEnabled = formData.get("self_service_enabled") === "on";
  const managerQuotaCap = Number(formData.get("manager_quota_cap"));
  const subBaseUrl = field(formData, "sub_base_url", 200);

  if (
    !Number.isInteger(managerQuotaCap) ||
    managerQuotaCap < 1 ||
    managerQuotaCap > 99
  ) {
    return { error: "سقف سهمیه مدیران باید بین ۱ تا ۹۹ باشد." };
  }
  if (subBaseUrl && !/^https?:\/\/\S+$/i.test(subBaseUrl)) {
    return { error: "آدرس پایه لینک اشتراک باید با http(s) شروع شود." };
  }

  const { error } = await createAdminClient()
    .from("digital_settings")
    .update({
      default_inbound_ids: defaultInboundIds,
      self_service_enabled: selfServiceEnabled,
      manager_quota_cap: managerQuotaCap,
      sub_base_url: subBaseUrl || null,
    })
    .eq("id", 1);

  if (error) {
    console.error("saveDigitalSettings failed", error);
    if (isMissingRelation(error)) {
      return { error: "جدول تنظیمات کانفیگ روی دیتابیس وجود ندارد." };
    }
    return { error: "ذخیره تنظیمات انجام نشد." };
  }

  refresh();
  return { ok: "تنظیمات کانفیگ ذخیره شد." };
}
