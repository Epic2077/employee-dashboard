import "server-only";

import { requireCapability } from "@/lib/auth/permissions";
import type { AppRole } from "@/lib/auth/roles";
import { APP_ROLES } from "@/lib/auth/roles";
import {
  ROLE_DEFAULT_SCOPES,
  emptyScopes,
  isCapability,
  toScope,
  type ScopeMap,
} from "@/lib/auth/scopes";
import { createClient } from "@/lib/supabase/server";
import { isMissingRelation as isMissing } from "@/lib/data/errors";
import { fetchScopedProfiles } from "@/lib/data/profiles";

export type PermissionMatrix = Record<AppRole, ScopeMap>;

export type TeamRow = {
  id: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  memberCount: number;
};

export type ManagerOption = {
  id: string;
  name: string;
  department: string | null;
};

export type PermissionsPageData = {
  /** False until the teams/permissions migration is applied. */
  available: boolean;
  source: "db" | "defaults";
  matrix: PermissionMatrix;
  teams: TeamRow[];
  managers: ManagerOption[];
};

function defaultMatrix(): PermissionMatrix {
  return {
    employee: { ...ROLE_DEFAULT_SCOPES.employee },
    manager: { ...ROLE_DEFAULT_SCOPES.manager },
    ceo: { ...ROLE_DEFAULT_SCOPES.ceo },
    admin: { ...ROLE_DEFAULT_SCOPES.admin },
    owner: { ...ROLE_DEFAULT_SCOPES.owner },
  };
}

export async function getPermissionsPageData(): Promise<PermissionsPageData> {
  await requireCapability("permissions.manage", { scopes: ["all"] });

  const supabase = await createClient();
  const [permissionsResult, teamsResult, profiles] = await Promise.all([
    supabase.from("role_permissions").select("role, capability, scope"),
    supabase
      .from("departments")
      .select("id, name, manager_id")
      .order("name", { ascending: true }),
    fetchScopedProfiles(supabase),
  ]);

  const matrix = defaultMatrix();
  const available =
    !isMissing(permissionsResult.error) && !isMissing(teamsResult.error);
  let source: "db" | "defaults" = "defaults";

  if (!isMissing(permissionsResult.error)) {
    const rows = permissionsResult.data ?? [];
    // A role that has at least one row is fully configured by the matrix.
    for (const role of APP_ROLES) {
      const roleRows = rows.filter((row) => row.role === role);
      if (roleRows.length === 0) continue;
      const scopes = emptyScopes();
      for (const row of roleRows) {
        if (isCapability(row.capability)) {
          scopes[row.capability] = toScope(row.scope);
        }
      }
      matrix[role] = scopes;
      source = "db";
    }
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const teams: TeamRow[] = isMissing(teamsResult.error)
    ? []
    : (teamsResult.data ?? []).map((team) => ({
        id: team.id,
        name: team.name,
        managerId: team.manager_id,
        managerName: team.manager_id
          ? (profileById.get(team.manager_id)?.full_name ?? "—")
          : null,
        memberCount: profiles.filter(
          (profile) => profile.department_id === team.id,
        ).length,
      }));

  const managers: ManagerOption[] = profiles
    .filter(
      (profile) =>
        profile.is_active &&
        (profile.role === "manager" ||
          profile.role === "ceo" ||
          profile.role === "admin" ||
          profile.role === "owner"),
    )
    .map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      department: profile.department,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fa"));

  return { available, source, matrix, teams, managers };
}
