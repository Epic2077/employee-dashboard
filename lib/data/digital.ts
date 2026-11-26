import "server-only";

import { getMyAccess } from "@/lib/auth/permissions";
import { requireCapability } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/permissions";
import { toAppRole } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { isMissingRelation } from "@/lib/data/errors";
import { fetchScopedProfiles } from "@/lib/data/profiles";
import { filterVisibleProfiles } from "@/lib/data/scope";
import type {
  DigitalAdminData,
  DigitalConfigView,
  DigitalSettingsView,
  DigitalTabData,
  DigitalUserRow,
} from "@/lib/digital/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isXuiConfigured,
  listInbounds,
  subscriptionUrl,
} from "@/lib/v2ray/xui";

const DEFAULT_SETTINGS: DigitalSettingsView = {
  selfServiceEnabled: true,
  defaultInboundIds: [],
  managerQuotaCap: 5,
  subBaseUrl: null,
};

const DEFAULT_QUOTA = 1;

function configView(
  row: {
    id: string;
    label: string;
    email: string;
    sub_id: string;
    inbound_ids: number[];
    status: "active" | "revoked" | "error";
    traffic_limit_gb: number | null;
    expires_on: string | null;
    created_at: string;
    error_message: string | null;
    user_id: string;
  },
  subBaseUrl: string | null,
  owner?: { name: string; department: string | null },
): DigitalConfigView {
  return {
    id: row.id,
    label: row.label,
    email: row.email,
    subscriptionUrl: subscriptionUrl(row.sub_id, subBaseUrl),
    inboundIds: row.inbound_ids ?? [],
    status: row.status,
    trafficLimitGb: row.traffic_limit_gb,
    expiresOn: row.expires_on,
    createdAt: row.created_at,
    errorMessage: row.error_message,
    ownerId: row.user_id,
    ownerName: owner?.name ?? "—",
    ownerDepartment: owner?.department ?? null,
  };
}

async function readSettings() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("digital_settings")
    .select(
      "self_service_enabled, default_inbound_ids, manager_quota_cap, sub_base_url",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return { settings: DEFAULT_SETTINGS, available: !isMissingRelation(error) };
  }

  return {
    available: true,
    settings: {
      selfServiceEnabled: data?.self_service_enabled ?? true,
      defaultInboundIds: data?.default_inbound_ids ?? [],
      managerQuotaCap: data?.manager_quota_cap ?? 5,
      subBaseUrl: data?.sub_base_url ?? null,
    } satisfies DigitalSettingsView,
  };
}

export function quotaFor(
  role: string,
  quotaRow: number | undefined,
): number | null {
  if (toAppRole(role) === "owner") return null;
  return quotaRow ?? DEFAULT_QUOTA;
}

/** Quota that limits how many configs `target` may own, as seen by `actor`. */
export function effectiveQuota(
  actor: Access,
  targetRole: string,
  targetQuota: number | undefined,
): number | null {
  if (actor.isOwner) return null;
  return quotaFor(targetRole, targetQuota);
}

/** The «کانفیگ» tab for the signed-in user. */
export async function getMyDigitalTab(): Promise<DigitalTabData> {
  await requireCapability("config.view");
  const profile = await getCurrentProfile();
  const access = await getMyAccess();
  const { settings, available } = await readSettings();

  const empty: DigitalTabData = {
    available,
    configured: isXuiConfigured(),
    fullName: profile.full_name,
    selfServiceEnabled: settings.selfServiceEnabled,
    quota: quotaFor(access.role, undefined),
    used: 0,
    canCreate: false,
    configs: [],
  };

  if (!available) {
    return empty;
  }

  const supabase = await createClient();
  const [configsResult, quotaResult] = await Promise.all([
    supabase
      .from("v2ray_configs")
      .select(
        "id, label, email, sub_id, inbound_ids, status, traffic_limit_gb, expires_on, created_at, error_message, user_id",
      )
      .eq("user_id", profile.id)
      .neq("status", "revoked")
      .order("created_at", { ascending: true }),
    supabase
      .from("v2ray_quotas")
      .select("max_configs")
      .eq("user_id", profile.id)
      .maybeSingle(),
  ]);

  if (isMissingRelation(configsResult.error)) {
    return empty;
  }

  const configs = (configsResult.data ?? []).map((row) =>
    configView(row, settings.subBaseUrl),
  );
  const quota = quotaFor(access.role, quotaResult.data?.max_configs);
  const used = configs.length;

  return {
    available: true,
    configured: isXuiConfigured(),
    fullName: profile.full_name,
    selfServiceEnabled: settings.selfServiceEnabled,
    quota,
    used,
    canCreate:
      isXuiConfigured() &&
      settings.selfServiceEnabled &&
      (quota === null || used < quota),
    configs,
  };
}

/** Admin view: configs + quotas for everyone in scope. */
export async function getDigitalAdminData(): Promise<DigitalAdminData> {
  const access = await requireCapability("digital.manage");
  const scope = access.scopes["digital.manage"];
  const { settings, available } = await readSettings();

  const base: DigitalAdminData = {
    available,
    configured: isXuiConfigured(),
    inbounds: [],
    inboundsError: null,
    settings,
    canManageNodes: scope === "all",
    isOwner: access.isOwner,
    users: [],
    configs: [],
  };

  if (!available) {
    return base;
  }

  const supabase = await createClient();
  const profiles = filterVisibleProfiles(
    await fetchScopedProfiles(supabase),
    access,
    scope,
  ).filter((profile) => profile.is_active);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const [configsResult, quotasResult] = await Promise.all([
    supabase
      .from("v2ray_configs")
      .select(
        "id, label, email, sub_id, inbound_ids, status, traffic_limit_gb, expires_on, created_at, error_message, user_id",
      )
      .neq("status", "revoked")
      .order("created_at", { ascending: false }),
    supabase.from("v2ray_quotas").select("user_id, max_configs"),
  ]);

  const configRows = isMissingRelation(configsResult.error)
    ? []
    : (configsResult.data ?? []);
  const quotaByUser = new Map(
    (isMissingRelation(quotasResult.error)
      ? []
      : (quotasResult.data ?? [])
    ).map((row) => [row.user_id, row.max_configs]),
  );

  const usedByUser = new Map<string, number>();
  for (const row of configRows) {
    usedByUser.set(row.user_id, (usedByUser.get(row.user_id) ?? 0) + 1);
  }

  const users: DigitalUserRow[] = profiles
    .map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      department: profile.department,
      role: profile.role,
      quota: quotaFor(profile.role, quotaByUser.get(profile.id)),
      used: usedByUser.get(profile.id) ?? 0,
    }))
    .sort((a, b) => b.used - a.used || a.name.localeCompare(b.name, "fa"));

  const configs = configRows.map((row) => {
    const owner = profileById.get(row.user_id);
    return configView(row, settings.subBaseUrl, {
      name: owner?.full_name ?? "کاربر خارج از دسترسی",
      department: owner?.department ?? null,
    });
  });

  let inbounds: DigitalAdminData["inbounds"] = [];
  let inboundsError: string | null = null;

  if (isXuiConfigured()) {
    try {
      inbounds = await listInbounds();
    } catch (error) {
      inboundsError =
        error instanceof Error ? error.message : "xui_list_failed";
    }
  }

  return {
    ...base,
    users,
    configs,
    inbounds,
    inboundsError,
  };
}

/** Scope check for server actions: may `actor` touch `targetUserId`? */
export async function actorCanTarget(
  access: Access,
  targetProfile: {
    id: string;
    department: string | null;
    department_id: string | null;
  },
): Promise<boolean> {
  const scope = access.scopes["digital.manage"];
  if (scope === "all") return true;
  if (scope !== "team") return false;

  const ids = new Set(access.managedDepartmentIds);
  const names = new Set(access.managedDepartmentNames);

  return (
    (targetProfile.department_id != null &&
      ids.has(targetProfile.department_id)) ||
    (targetProfile.department != null && names.has(targetProfile.department))
  );
}

/** Service-role client: config writes always run on the server. */
export function digitalWriter() {
  return createAdminClient();
}
