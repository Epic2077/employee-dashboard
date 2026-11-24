import "server-only";

import type { Access } from "@/lib/auth/permissions";
import { isMissingRelation } from "@/lib/data/errors";
import { actorCanTarget, effectiveQuota } from "@/lib/data/digital";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addClient,
  buildClientName,
  isXuiConfigured,
  listInbounds,
  newClientId,
  newSubId,
  removeClient,
  type XuiClientPayload,
} from "@/lib/v2ray/xui";

export type ProvisionResult =
  | { ok: true; id: string; email: string }
  | { ok: false; message: string };

const ENV_HINT =
  "پنل 3x-ui پیکربندی نشده است. متغیرهای XUI_BASE_URL، XUI_USERNAME و XUI_PASSWORD را در .env تنظیم کنید.";
const MIGRATION_HINT =
  "جدول‌های کانفیگ روی دیتابیس ساخته نشده‌اند. مایگریشن 20261124091825_digital_configs.sql را اجرا کنید.";

/**
 * Creates a V2Ray client on the panel for one employee and records it.
 *
 * - `self`: the employee claims their own config (needs self-service enabled)
 * - `staff`: an admin/manager provisions for someone in their scope
 * - quota: target's `v2ray_quotas` (default 1), bypassed for the owner
 * - nodes: explicit selection (full-scope staff only) → defaults → all enabled
 */
export async function provisionConfig({
  actor,
  targetUserId,
  requestedInboundIds = [],
  mode,
}: {
  actor: Access;
  targetUserId: string;
  requestedInboundIds?: number[];
  mode: "self" | "staff";
}): Promise<ProvisionResult> {
  if (!isXuiConfigured()) {
    return { ok: false, message: ENV_HINT };
  }

  const admin = createAdminClient();

  const [settingsResult, targetResult] = await Promise.all([
    admin
      .from("digital_settings")
      .select("self_service_enabled, default_inbound_ids")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, full_name, department, department_id, role, is_active")
      .eq("id", targetUserId)
      .maybeSingle(),
  ]);

  if (isMissingRelation(settingsResult.error)) {
    return { ok: false, message: MIGRATION_HINT };
  }
  if (settingsResult.error) {
    return { ok: false, message: "خواندن تنظیمات کانفیگ انجام نشد." };
  }
  if (!targetResult.data) {
    return { ok: false, message: "کارمند پیدا نشد." };
  }

  const target = targetResult.data;
  if (!target.is_active) {
    return { ok: false, message: "این حساب غیرفعال است." };
  }

  if (mode === "self" && !settingsResult.data?.self_service_enabled) {
    return {
      ok: false,
      message:
        "ساخت کانفیگ توسط خود کارمند غیرفعال است؛ با مدیر سیستم تماس بگیرید.",
    };
  }

  if (mode === "staff" && !(await actorCanTarget(actor, target))) {
    return { ok: false, message: "این کارمند خارج از دسترسی شماست." };
  }

  if (mode === "self" && target.id !== actor.userId) {
    return { ok: false, message: "درخواست نامعتبر است." };
  }

  const [quotaResult, existingResult] = await Promise.all([
    admin
      .from("v2ray_quotas")
      .select("max_configs")
      .eq("user_id", target.id)
      .maybeSingle(),
    admin
      .from("v2ray_configs")
      .select("email")
      .eq("user_id", target.id)
      .neq("status", "revoked"),
  ]);

  if (existingResult.error) {
    return { ok: false, message: "خواندن کانفیگ‌های فعلی انجام نشد." };
  }

  const quota = effectiveQuota(
    actor,
    target.role,
    quotaResult.data?.max_configs,
  );
  const existingEmails = new Set(
    (existingResult.data ?? []).map((row) => row.email),
  );

  if (quota !== null && existingEmails.size >= quota) {
    return {
      ok: false,
      message: `سهمیه کانفیگ این کاربر (${quota}) پر شده است.`,
    };
  }

  let inbounds;
  try {
    inbounds = await listInbounds();
  } catch (error) {
    return {
      ok: false,
      message: `اتصال به پنل انجام نشد: ${
        error instanceof Error ? error.message : "خطای نامشخص"
      }`,
    };
  }

  const enabledInbounds = inbounds.filter((inbound) => inbound.enable);
  if (enabledInbounds.length === 0) {
    return { ok: false, message: "هیچ نود فعالی در پنل پیدا نشد." };
  }

  const enabledIds = new Set(enabledInbounds.map((inbound) => inbound.id));
  const canPickNodes = actor.scopes["digital.manage"] === "all";

  const requested = canPickNodes
    ? requestedInboundIds.filter((id) => enabledIds.has(id))
    : [];
  const defaults = (settingsResult.data?.default_inbound_ids ?? []).filter(
    (id) => enabledIds.has(id),
  );

  const inboundIds =
    requested.length > 0
      ? requested
      : defaults.length > 0
        ? defaults
        : enabledInbounds.map((inbound) => inbound.id);

  let index = existingEmails.size + 1;
  let email = buildClientName(target.full_name, index);
  while (existingEmails.has(email)) {
    index += 1;
    email = buildClientName(target.full_name, index);
  }

  const client: XuiClientPayload = {
    id: newClientId(),
    email,
    subId: newSubId(),
    limitIp: 0,
    totalGB: 0,
    expiryTime: 0,
    enable: true,
    flow: "",
  };

  const added: number[] = [];
  for (const inboundId of inboundIds) {
    try {
      await addClient(inboundId, client);
      added.push(inboundId);
    } catch (error) {
      // Roll back whatever already went through.
      for (const rollbackId of added) {
        try {
          await removeClient(rollbackId, client.id);
        } catch {
          // best effort
        }
      }
      return {
        ok: false,
        message: `ساخت کلاینت روی نود ${inboundId} انجام نشد: ${
          error instanceof Error ? error.message : "خطای نامشخص"
        }`,
      };
    }
  }

  const { data, error } = await admin
    .from("v2ray_configs")
    .insert({
      user_id: target.id,
      label: target.full_name,
      client_id: client.id,
      sub_id: client.subId,
      email,
      inbound_ids: added,
      created_by: actor.userId,
    })
    .select("id")
    .single();

  if (error) {
    for (const rollbackId of added) {
      try {
        await removeClient(rollbackId, client.id);
      } catch {
        // best effort
      }
    }

    return { ok: false, message: "ثبت کانفیگ در دیتابیس انجام نشد." };
  }

  return { ok: true, id: data.id, email };
}

/** Removes the panel clients of a config and marks the row revoked. */
export async function revokeConfigById(
  configId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = createAdminClient();
  const { data: config, error } = await admin
    .from("v2ray_configs")
    .select("id, client_id, inbound_ids, status")
    .eq("id", configId)
    .maybeSingle();

  if (error || !config) {
    return { ok: false, message: "کانفیگ پیدا نشد." };
  }
  if (config.status === "revoked") {
    return { ok: true };
  }

  if (isXuiConfigured()) {
    for (const inboundId of config.inbound_ids ?? []) {
      try {
        await removeClient(inboundId, config.client_id);
      } catch (panelError) {
        await admin
          .from("v2ray_configs")
          .update({
            error_message:
              panelError instanceof Error
                ? panelError.message
                : "xui_delete_failed",
          })
          .eq("id", config.id);
      }
    }
  }

  const { error: updateError } = await admin
    .from("v2ray_configs")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", config.id);

  if (updateError) {
    return { ok: false, message: "لغو کانفیگ انجام نشد." };
  }

  return { ok: true };
}
