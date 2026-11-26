import "server-only";

import { requireFullCapability } from "@/lib/auth/permissions";
import type { AppRole } from "@/lib/auth/roles";
import { APP_ROLES, toAppRole } from "@/lib/auth/roles";
import {
  CAPABILITIES,
  ROLE_DEFAULT_SCOPES,
  emptyScopes,
  isCapability,
  toScope,
  type Capability,
  type Scope,
  type ScopeMap,
} from "@/lib/auth/scopes";
import type { CategoryRow } from "@/lib/data/categories";
import { getCategories } from "@/lib/data/categories";
import { isMissingRelation as isMissing } from "@/lib/data/errors";
import { fetchScopedProfiles } from "@/lib/data/profiles";
import type { ProfileRole } from "@/lib/supabase/models";
import { createClient } from "@/lib/supabase/server";

export type GrantMode = "grant" | "deny";

export type CapabilityGrant = {
  mode: GrantMode;
  scope: Scope;
};

export type CategoryModeMap = Record<string, GrantMode>;

/**
 * What one subject (team, team manager or person) explicitly has. A null
 * capability means "inherit from the layer above".
 */
export type SubjectAccess = {
  capabilities: Record<Capability, CapabilityGrant | null>;
  categories: Partial<Record<Capability, CategoryModeMap>>;
};

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
  /** False until the layered-access migration is applied. */
  available: boolean;
  source: "db" | "defaults";
  matrix: PermissionMatrix;
  teams: TeamRow[];
  managers: ManagerOption[];
  categories: CategoryRow[];
};

export type TeamAccessData = {
  available: boolean;
  team: TeamRow;
  members: {
    id: string;
    fullName: string;
    employeeCode: string | null;
    role: ProfileRole;
  }[];
  managers: ManagerOption[];
  categories: CategoryRow[];
  memberAccess: SubjectAccess;
  managerAccess: SubjectAccess;
};

export type PersonRow = {
  id: string;
  fullName: string;
  department: string | null;
  role: ProfileRole;
  isActive: boolean;
  exceptionCount: number;
};

export type PeoplePageData = {
  available: boolean;
  people: PersonRow[];
  q: string;
};

export type PersonAccessData = {
  available: boolean;
  person: {
    id: string;
    fullName: string;
    department: string | null;
    role: ProfileRole;
    isActive: boolean;
  };
  effective: ScopeMap;
  effectiveCategories: Partial<Record<Capability, Record<string, Scope>>>;
  exceptions: SubjectAccess;
  categories: CategoryRow[];
};

type GrantRow = {
  subject_type: "role" | "team" | "team_manager" | "user";
  role: string | null;
  department_id: string | null;
  user_id: string | null;
  capability: string;
  category_id: string | null;
  mode: GrantMode;
  scope: string;
};

const GRANT_COLUMNS =
  "subject_type, role, department_id, user_id, capability, category_id, mode, scope";

function defaultMatrix(): PermissionMatrix {
  return {
    employee: { ...ROLE_DEFAULT_SCOPES.employee },
    manager: { ...ROLE_DEFAULT_SCOPES.manager },
    ceo: { ...ROLE_DEFAULT_SCOPES.ceo },
    admin: { ...ROLE_DEFAULT_SCOPES.admin },
    owner: { ...ROLE_DEFAULT_SCOPES.owner },
  };
}

export function emptySubjectAccess(): SubjectAccess {
  const capabilities = {} as Record<Capability, CapabilityGrant | null>;
  for (const capability of CAPABILITIES) {
    capabilities[capability] = null;
  }
  return { capabilities, categories: {} };
}

function applyRows(target: SubjectAccess, rows: GrantRow[]) {
  for (const row of rows) {
    if (!isCapability(row.capability)) continue;

    if (row.category_id) {
      const current = target.categories[row.capability] ?? {};
      current[row.category_id] = row.mode;
      target.categories[row.capability] = current;
    } else {
      target.capabilities[row.capability] = {
        mode: row.mode,
        scope: toScope(row.scope),
      };
    }
  }
}

function managerOptions(
  profiles: Awaited<ReturnType<typeof fetchScopedProfiles>>,
) {
  // Any active person can be a team manager; the profile role stays untouched,
  // the team-manager grants provide the access.
  return profiles
    .filter((profile) => profile.is_active)
    .map((profile) => ({
      id: profile.id,
      name: profile.full_name,
      department: profile.department,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fa"));
}

async function loadGrantRows(
  filter: {
    subjectTypes: GrantRow["subject_type"][];
    departmentId?: string;
    userId?: string;
  },
): Promise<{ rows: GrantRow[]; available: boolean }> {
  const supabase = await createClient();
  let query = supabase
    .from("access_grants")
    .select(GRANT_COLUMNS)
    .in("subject_type", filter.subjectTypes);

  if (filter.departmentId) {
    query = query.eq("department_id", filter.departmentId);
  }
  if (filter.userId) {
    query = query.eq("user_id", filter.userId);
  }

  const { data, error } = await query;

  if (isMissing(error)) {
    return { rows: [], available: false };
  }
  if (error) {
    throw new Error(`Failed to load grants: ${error.message}`);
  }

  return { rows: (data ?? []) as GrantRow[], available: true };
}

export async function getPermissionsPageData(): Promise<PermissionsPageData> {
  await requireFullCapability("permissions.manage");

  const supabase = await createClient();
  const [roleGrants, teamsResult, profiles, categories] = await Promise.all([
    loadGrantRows({ subjectTypes: ["role"] }),
    supabase
      .from("departments")
      .select("id, name, manager_id")
      .order("name", { ascending: true }),
    fetchScopedProfiles(supabase),
    getCategories(),
  ]);

  // With a configured database the stored rows are authoritative, so a
  // capability the owner removed stays "none" instead of falling back to the
  // built-in defaults.
  const matrix: PermissionMatrix =
    roleGrants.rows.length > 0
      ? {
          employee: emptyScopes(),
          manager: emptyScopes(),
          ceo: emptyScopes(),
          admin: emptyScopes(),
          owner: emptyScopes(),
        }
      : defaultMatrix();
  let source: "db" | "defaults" = "defaults";

  for (const row of roleGrants.rows) {
    if (!isCapability(row.capability)) continue;
    if (!APP_ROLES.includes(row.role as AppRole)) continue;
    if (row.mode === "deny") {
      matrix[row.role as AppRole][row.capability] = "none";
    } else {
      matrix[row.role as AppRole][row.capability] = toScope(row.scope);
    }
    source = "db";
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const dbAvailable = roleGrants.available && !isMissing(teamsResult.error);

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

  return {
    available: dbAvailable,
    source,
    matrix,
    teams,
    managers: managerOptions(profiles),
    categories,
  };
}

export async function getTeamAccessData(
  teamId: string,
): Promise<TeamAccessData | null> {
  await requireFullCapability("permissions.manage");

  const supabase = await createClient();
  const [teamResult, grants, profiles, categories] = await Promise.all([
    supabase
      .from("departments")
      .select("id, name, manager_id")
      .eq("id", teamId)
      .maybeSingle(),
    loadGrantRows({
      subjectTypes: ["team", "team_manager"],
      departmentId: teamId,
    }),
    fetchScopedProfiles(supabase),
    getCategories(),
  ]);

  if (isMissing(teamResult.error)) {
    return null;
  }
  if (teamResult.error) {
    throw new Error(`Failed to load team: ${teamResult.error.message}`);
  }
  if (!teamResult.data) {
    return null;
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const team = teamResult.data;
  const members = profiles.filter(
    (profile) => profile.department_id === team.id,
  );

  const memberAccess = emptySubjectAccess();
  const managerAccess = emptySubjectAccess();
  applyRows(
    memberAccess,
    grants.rows.filter((row) => row.subject_type === "team"),
  );
  applyRows(
    managerAccess,
    grants.rows.filter((row) => row.subject_type === "team_manager"),
  );

  return {
    available: grants.available,
    team: {
      id: team.id,
      name: team.name,
      managerId: team.manager_id,
      managerName: team.manager_id
        ? (profileById.get(team.manager_id)?.full_name ?? "—")
        : null,
      memberCount: members.length,
    },
    members: members
      .map((profile) => ({
        id: profile.id,
        fullName: profile.full_name,
        employeeCode: profile.employee_code,
        role: profile.role,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "fa")),
    managers: managerOptions(profiles),
    categories,
    memberAccess,
    managerAccess,
  };
}

export async function getPeopleAccessData({
  q = "",
}: {
  q?: string;
} = {}): Promise<PeoplePageData> {
  await requireFullCapability("permissions.manage");

  const supabase = await createClient();
  const [profiles, grants] = await Promise.all([
    fetchScopedProfiles(supabase),
    loadGrantRows({ subjectTypes: ["user"] }),
  ]);

  const counts = new Map<string, number>();
  for (const row of grants.rows) {
    if (!row.user_id) continue;
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }

  const query = q.trim().toLocaleLowerCase("fa");
  const people = profiles
    .map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      department: profile.department,
      role: profile.role,
      isActive: profile.is_active,
      exceptionCount: counts.get(profile.id) ?? 0,
    }))
    .filter(
      (person) =>
        !query ||
        [person.fullName, person.department ?? ""]
          .join(" ")
          .toLocaleLowerCase("fa")
          .includes(query),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "fa"));

  return { available: grants.available, people, q: query };
}

export async function getPersonAccessData(
  userId: string,
): Promise<PersonAccessData | null> {
  await requireFullCapability("permissions.manage");

  const supabase = await createClient();
  const [profileResult, grants, categories, effectiveResult] = await Promise.all(
    [
      supabase
        .from("profiles")
        .select(
          "id, full_name, department, role, is_active, department_id, employee_code",
        )
        .eq("id", userId)
        .maybeSingle(),
      loadGrantRows({ subjectTypes: ["user"], userId }),
      getCategories(),
      supabase.rpc("effective_access_for", { p_user_id: userId }),
    ],
  );

  if (isMissing(profileResult.error)) {
    return null;
  }
  if (profileResult.error) {
    throw new Error(`Failed to load person: ${profileResult.error.message}`);
  }
  if (!profileResult.data) {
    return null;
  }

  const effective = emptyScopes();
  const effectiveCategories: Partial<
    Record<Capability, Record<string, Scope>>
  > = {};

  if (!isMissing(effectiveResult.error) && !effectiveResult.error) {
    for (const row of effectiveResult.data ?? []) {
      if (!isCapability(row.capability)) continue;
      if (row.category_id) {
        const map = effectiveCategories[row.capability] ?? {};
        map[row.category_id] = toScope(row.scope);
        effectiveCategories[row.capability] = map;
      } else {
        effective[row.capability] = toScope(row.scope);
      }
    }
  } else {
    Object.assign(effective, ROLE_DEFAULT_SCOPES[toAppRole(profileResult.data.role)]);
  }

  const exceptions = emptySubjectAccess();
  applyRows(exceptions, grants.rows);

  return {
    available: grants.available,
    person: {
      id: profileResult.data.id,
      fullName: profileResult.data.full_name,
      department: profileResult.data.department,
      role: profileResult.data.role,
      isActive: profileResult.data.is_active,
    },
    effective,
    effectiveCategories,
    exceptions,
    categories,
  };
}