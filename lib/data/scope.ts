import "server-only";

import type { Access, Scope } from "@/lib/auth/permissions";

export type ScopedProfile = {
  id: string;
  department?: string | null;
  department_id?: string | null;
};

/**
 * Restrict a profile list to the rows the viewer may see for a capability
 * scope. Team members are matched by department id (after the teams
 * migration) and by department name (before it).
 */
export function filterVisibleProfiles<T extends ScopedProfile>(
  profiles: T[],
  access: Access,
  scope: Scope,
): T[] {
  switch (scope) {
    case "all":
      return profiles;
    case "self":
      return profiles.filter((profile) => profile.id === access.userId);
    case "team": {
      const ids = new Set(access.managedDepartmentIds);
      const names = new Set(access.managedDepartmentNames);
      return profiles.filter(
        (profile) =>
          (profile.department_id != null && ids.has(profile.department_id)) ||
          (profile.department != null && names.has(profile.department)),
      );
    }
    default:
      return [];
  }
}

export function matchesDepartment(
  profile: ScopedProfile,
  department: string,
): boolean {
  return (
    profile.department === department || profile.department_id === department
  );
}

export function departmentOptions(profiles: ScopedProfile[]): string[] {
  const names = new Set<string>();
  for (const profile of profiles) {
    if (profile.department && profile.department.trim()) {
      names.add(profile.department.trim());
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, "fa"));
}
