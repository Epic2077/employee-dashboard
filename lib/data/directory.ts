import "server-only";

import { requireCapability } from "@/lib/auth/permissions";
import { toAppRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileRole } from "@/lib/supabase/models";

export type DirectoryEntry = {
  id: string;
  fullName: string;
  username: string;
  employeeCode: string | null;
  department: string | null;
  role: ProfileRole;
  phone: string | null;
  email: string | null;
  isTeamMember: boolean;
};

export type DirectoryData = {
  q: string;
  teamNames: string[];
  team: DirectoryEntry[];
  everyone: DirectoryEntry[];
  total: number;
};

type ProfileRow = {
  id: string;
  username: string;
  full_name: string;
  employee_code: string | null;
  department: string | null;
  department_id: string | null;
  email: string | null;
  role: ProfileRole;
  is_active: boolean;
};

/**
 * Contact directory for every signed-in employee.
 *
 * Profiles are read with the service role because the RLS policies only let
 * staff read people inside their own scope; the directory is an explicit
 * company-wide feature, and only safe columns (name, unit, role, phone) leave
 * the server.
 */
export async function getDirectory({
  q = "",
}: {
  q?: string;
} = {}): Promise<DirectoryData> {
  const access = await requireCapability("directory.view");
  const admin = createAdminClient();

  const primary = await admin
    .from("profiles")
    .select(
      "id, username, full_name, employee_code, department, department_id, email, role, is_active",
    )
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  let profiles: ProfileRow[];

  if (!primary.error) {
    profiles = primary.data ?? [];
  } else if (primary.error.code === "42703") {
    const fallback = await admin
      .from("profiles")
      .select(
        "id, username, full_name, employee_code, department, email, role, is_active",
      )
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (fallback.error) {
      throw new Error(`Failed to load directory: ${fallback.error.message}`);
    }

    profiles = (fallback.data ?? []).map((row) => ({
      ...row,
      department_id: null,
    }));
  } else {
    throw new Error(`Failed to load directory: ${primary.error.message}`);
  }

  // Phones live in auth metadata, not in profiles.
  const phones = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      break;
    }

    for (const user of data.users) {
      const phone = user.user_metadata?.phone;
      if (typeof phone === "string" && phone.trim()) {
        phones.set(user.id, phone.trim());
      }
    }

    if (data.users.length < 1000) {
      break;
    }
  }

  const teamNameSet = new Set(
    access.teamDepartmentNames.filter((name) => Boolean(name && name.trim())),
  );
  const teamIdSet = new Set(access.teamDepartmentIds);

  const entries: DirectoryEntry[] = profiles.map((profile) => {
    const isTeamMember =
      profile.id !== access.userId &&
      ((profile.department_id != null &&
        teamIdSet.has(profile.department_id)) ||
        (profile.department != null && teamNameSet.has(profile.department)));

    return {
      id: profile.id,
      fullName: profile.full_name,
      username: profile.username,
      employeeCode: profile.employee_code,
      department: profile.department,
      role: toAppRole(profile.role),
      phone: phones.get(profile.id) ?? null,
      email: profile.email,
      isTeamMember,
    };
  });

  const query = q.trim().toLocaleLowerCase("fa");
  const matches = (entry: DirectoryEntry) =>
    !query ||
    [
      entry.fullName,
      entry.username,
      entry.employeeCode ?? "",
      entry.department ?? "",
      entry.phone ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase("fa")
      .includes(query);

  const filtered = entries.filter(matches);

  return {
    q: query,
    teamNames: [...teamNameSet],
    team: filtered.filter((entry) => entry.isTeamMember),
    everyone: filtered,
    total: filtered.length,
  };
}
