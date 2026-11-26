import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { AppRole } from "@/lib/auth/roles";
import { toAppRole } from "@/lib/auth/roles";
import {
  ADMIN_AREA_CAPABILITIES,
  CAPABILITIES,
  ROLE_DEFAULT_SCOPES,
  allScopes,
  emptyScopes,
  isCapability,
  toScope,
} from "@/lib/auth/scopes";
import type { Capability, Scope, ScopeMap } from "@/lib/auth/scopes";
import { getCurrentProfile } from "@/lib/auth/session";
import { isMissingRelation } from "@/lib/data/errors";
import { createClient } from "@/lib/supabase/server";

export * from "@/lib/auth/scopes";

/** A team (department) with its display name. */
export type TeamRef = {
  id: string;
  name: string;
};

export type Access = {
  userId: string;
  role: AppRole;
  isOwner: boolean;
  /** Effective capability-wide scopes after role + team + manager + person. */
  scopes: ScopeMap;
  /** Teams where the user is the manager. */
  managedDepartmentIds: string[];
  managedDepartmentNames: string[];
  /** Teams the user may see: managed teams plus their own team. */
  teamDepartmentIds: string[];
  teamDepartmentNames: string[];
  departmentId: string | null;
  departmentName: string | null;
  /** Per-category scopes resolved from the grants. */
  categoryScopes: Partial<Record<Capability, Record<string, Scope>>>;
  /** True when the capability or at least one of its categories is allowed. */
  hasAccess: (capability: Capability) => boolean;
  /** Scope for a specific data category, falling back to the capability. */
  categoryScope: (capability: Capability, categoryId: string | null) => Scope;
  /** "db" when the grants came from the database, "defaults" otherwise. */
  source: "db" | "defaults";
};

type EffectiveRow = {
  capability: string;
  category_id: string | null;
  scope: string;
};

function categoryScopeResolver(
  scopes: ScopeMap,
  categoryScopes: Partial<Record<Capability, Record<string, Scope>>>,
) {
  return (capability: Capability, categoryId: string | null): Scope => {
    if (!categoryId) {
      return scopes[capability];
    }
    return categoryScopes[capability]?.[categoryId] ?? scopes[capability];
  };
}

function hasAccessResolver(
  scopes: ScopeMap,
  categoryScopes: Partial<Record<Capability, Record<string, Scope>>>,
) {
  return (capability: Capability): boolean => {
    if (scopes[capability] !== "none") return true;
    return Object.values(categoryScopes[capability] ?? {}).some(
      (scope) => scope !== "none",
    );
  };
}

/**
 * Effective access for the signed-in user, resolved in SQL so the app and the
 * RLS policies can never disagree. Falls back to the built-in defaults until
 * the layered-access migration has been applied.
 */
export const getMyAccess = cache(async (): Promise<Access> => {
  const profile = await getCurrentProfile();
  const role = toAppRole(profile.role);
  const departmentId = profile.department_id ?? null;
  const departmentName = profile.department ?? null;

  const base = {
    userId: profile.id,
    role,
    departmentId,
    departmentName,
  };

  // Owner always has everything and does not depend on the grant tables.
  if (role === "owner") {
    const scopes = allScopes();
    return {
      ...base,
      isOwner: true,
      scopes,
      managedDepartmentIds: [],
      managedDepartmentNames: [],
      teamDepartmentIds: departmentId ? [departmentId] : [],
      teamDepartmentNames: departmentName ? [departmentName] : [],
      categoryScopes: {},
      hasAccess: hasAccessResolver(scopes, {}),
      categoryScope: categoryScopeResolver(scopes, {}),
      source: "defaults",
    };
  }

  const supabase = await createClient();
  const [accessResult, departmentsResult] = await Promise.all([
    supabase.rpc("my_effective_access"),
    supabase.from("departments").select("id, name, manager_id"),
  ]);

  const scopes: ScopeMap = { ...ROLE_DEFAULT_SCOPES[role] };
  const categoryScopes: Partial<Record<Capability, Record<string, Scope>>> = {};
  let source: "db" | "defaults" = "defaults";

  if (!isMissingRelation(accessResult.error) && !accessResult.error) {
    const rows = (accessResult.data ?? []) as EffectiveRow[];
    if (rows.length > 0) {
      const fromDb = emptyScopes();
      for (const row of rows) {
        if (!isCapability(row.capability)) continue;
        const scope = toScope(row.scope);

        if (row.category_id) {
          const byCategory = categoryScopes[row.capability] ?? {};
          byCategory[row.category_id] = scope;
          categoryScopes[row.capability] = byCategory;
        } else {
          fromDb[row.capability] = scope;
        }
      }

      // Capabilities the database did not return (older catalogue) keep the
      // built-in defaults instead of silently losing access.
      for (const capability of CAPABILITIES) {
        if (
          !rows.some(
            (row) => row.capability === capability && !row.category_id,
          )
        ) {
          fromDb[capability] = scopes[capability];
        }
      }

      Object.assign(scopes, fromDb);
      source = "db";
    }
  }

  const departments = isMissingRelation(departmentsResult.error)
    ? []
    : (departmentsResult.data ?? []);

  const managed = departments.filter(
    (department) => department.manager_id === profile.id,
  );
  const managedDepartmentIds = managed.map((department) => department.id);
  const managedDepartmentNames = managed.map((department) => department.name);

  const ownTeam = departmentId
    ? departments.find((department) => department.id === departmentId)
    : undefined;
  const ownName = ownTeam?.name ?? departmentName;

  const teamDepartmentIds = [...managedDepartmentIds];
  if (departmentId && !teamDepartmentIds.includes(departmentId)) {
    teamDepartmentIds.push(departmentId);
  }
  const teamDepartmentNames = [...managedDepartmentNames];
  if (ownName && !teamDepartmentNames.includes(ownName)) {
    teamDepartmentNames.push(ownName);
  }

  return {
    ...base,
    isOwner: false,
    scopes,
    managedDepartmentIds,
    managedDepartmentNames:
      managedDepartmentNames.length > 0
        ? managedDepartmentNames
        : ownName
          ? [ownName]
          : [],
    teamDepartmentIds,
    teamDepartmentNames,
    categoryScopes,
    hasAccess: hasAccessResolver(scopes, categoryScopes),
    categoryScope: categoryScopeResolver(scopes, categoryScopes),
    source,
  };
});

export async function requireCapability(
  capability: Capability,
  options?: { scopes?: Scope[] },
): Promise<Access> {
  const access = await getMyAccess();
  const allowed = options?.scopes ?? ["self", "team", "all"];
  const categoryAllowed = Object.values(
    access.categoryScopes[capability] ?? {},
  ).some((scope) => allowed.includes(scope));

  if (!allowed.includes(access.scopes[capability]) && !categoryAllowed) {
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
  return ADMIN_AREA_CAPABILITIES.some((capability) =>
    access.hasAccess(capability),
  );
}