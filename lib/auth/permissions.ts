import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { AppRole } from "@/lib/auth/roles";
import { toAppRole } from "@/lib/auth/roles";
import {
  CAPABILITIES,
  ROLE_DEFAULT_SCOPES,
  allScopes,
  emptyScopes,
  isCapability,
  toScope,
} from "@/lib/auth/scopes";
import type { Capability, Scope, ScopeMap } from "@/lib/auth/scopes";
import { getCurrentProfile } from "@/lib/auth/session";
import { isMissingRelation as isMissingTable } from "@/lib/data/errors";
import { createClient } from "@/lib/supabase/server";

export * from "@/lib/auth/scopes";

export type Access = {
  userId: string;
  role: AppRole;
  isOwner: boolean;
  scopes: ScopeMap;
  managedDepartmentIds: string[];
  managedDepartmentNames: string[];
  departmentId: string | null;
  departmentName: string | null;
  /** "db" when the matrix came from role_permissions, "defaults" otherwise. */
  source: "db" | "defaults";
};

/**
 * Effective access for the signed-in user: role, capability scopes and the
 * departments they manage. Falls back to the built-in defaults until the
 * teams/permissions migration has been applied.
 */
export const getMyAccess = cache(async (): Promise<Access> => {
  const profile = await getCurrentProfile();
  const role = toAppRole(profile.role);
  const departmentId = profile.department_id ?? null;
  const departmentName = profile.department ?? null;

  const base = {
    userId: profile.id,
    role,
    isOwner: role === "owner",
    departmentId,
    departmentName,
  };

  // Owner always has everything and does not depend on the matrix.
  if (role === "owner") {
    return {
      ...base,
      isOwner: true,
      scopes: allScopes(),
      managedDepartmentIds: [],
      managedDepartmentNames: departmentName ? [departmentName] : [],
      source: "defaults",
    };
  }

  const supabase = await createClient();
  const [permissionsResult, departmentsResult] = await Promise.all([
    supabase
      .from("role_permissions")
      .select("capability, scope")
      .eq("role", role),
    supabase
      .from("departments")
      .select("id, name")
      .eq("manager_id", profile.id),
  ]);

  const missing =
    isMissingTable(permissionsResult.error) ||
    isMissingTable(departmentsResult.error);

  let scopes = { ...ROLE_DEFAULT_SCOPES[role] };
  let source: "db" | "defaults" = "defaults";

  if (!missing) {
    const rows = permissionsResult.data ?? [];
    // A role with no rows is treated as "not configured yet" and keeps the
    // defaults, so a broken seed never locks everybody out.
    if (rows.length > 0) {
      const fromDb = emptyScopes();
      for (const row of rows) {
        if (isCapability(row.capability)) {
          fromDb[row.capability] = toScope(row.scope);
        }
      }
      scopes = fromDb;
      source = "db";
    }
  }

  const managed = missing ? [] : (departmentsResult.data ?? []);

  return {
    ...base,
    isOwner: false,
    scopes,
    managedDepartmentIds: managed.map((row) => row.id),
    managedDepartmentNames:
      managed.length > 0
        ? managed.map((row) => row.name)
        : departmentName
          ? [departmentName]
          : [],
    source,
  };
});

export async function requireCapability(
  capability: Capability,
  options?: { scopes?: Scope[] },
): Promise<Access> {
  const access = await getMyAccess();
  const allowed = options?.scopes ?? ["self", "team", "all"];

  if (!allowed.includes(access.scopes[capability])) {
    redirect("/");
  }

  return access;
}

export async function requireFullCapability(
  capability: Capability,
): Promise<Access> {
  return requireCapability(capability, { scopes: ["all"] });
}

/** True when the user may open any part of /admin. */
export function hasAnyAdminAccess(access: Access): boolean {
  return CAPABILITIES.some(
    (capability) => access.scopes[capability] !== "none",
  );
}
