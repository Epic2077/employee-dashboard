import "server-only";

import { requireCapability } from "@/lib/auth/permissions";
import type { Scope } from "@/lib/auth/permissions";
import type { AppRole } from "@/lib/auth/roles";
import { APP_ROLES, toAppRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProfileRole } from "@/lib/supabase/models";
import { createClient } from "@/lib/supabase/server";
import { departmentOptions, filterVisibleProfiles } from "@/lib/data/scope";

export type AdminUserRow = {
  id: string;
  username: string;
  fullName: string;
  department: string | null;
  departmentId: string | null;
  employeeCode: string | null;
  email: string | null;
  phone: string | null;
  role: ProfileRole;
  isActive: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export type AdminUsersFilters = {
  role: string | null;
  department: string | null;
  q: string;
};

export type AdminUsersPageData = {
  actorRole: ProfileRole;
  actorId: string;
  scope: Scope;
  /** True when the actor may create / edit / delete accounts. */
  canManageUsers: boolean;
  /** True when the actor may touch owner accounts. */
  canManageOwners: boolean;
  /** Role options the current actor may assign. */
  assignableRoles: AppRole[];
  users: AdminUserRow[];
  departments: string[];
  filters: AdminUsersFilters;
  counts: { visible: number; active: number; managers: number };
};

type AuthUserInfo = {
  phone: string | null;
  lastSignInAt: string | null;
};

type AdminProfileRow = {
  id: string;
  username: string;
  full_name: string;
  department: string | null;
  department_id: string | null;
  employee_code: string | null;
  email: string | null;
  role: ProfileRole;
  is_active: boolean;
  created_at: string;
};

const PAGE_SIZE = 1000;

async function listAuthUserInfo() {
  const admin = createAdminClient();
  const info = new Map<string, AuthUserInfo>();

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    for (const user of data.users) {
      const phone = user.user_metadata?.phone;
      info.set(user.id, {
        phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
        lastSignInAt: user.last_sign_in_at ?? null,
      });
    }

    if (data.users.length < PAGE_SIZE) {
      break;
    }
  }

  return info;
}

export async function getAdminUsers({
  role = null,
  department = null,
  q = "",
}: Partial<AdminUsersFilters> = {}): Promise<AdminUsersPageData> {
  const access = await requireCapability("users.view");
  const scope = access.scopes["users.view"];
  const supabase = await createClient();

  const primary = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, department, department_id, employee_code, email, role, is_active, created_at",
    )
    .order("full_name", { ascending: true });

  let profileRows: AdminProfileRow[];

  if (!primary.error) {
    profileRows = primary.data ?? [];
  } else if (primary.error.code === "42703") {
    const fallback = await supabase
      .from("profiles")
      .select(
        "id, username, full_name, department, employee_code, email, role, is_active, created_at",
      )
      .order("full_name", { ascending: true });

    if (fallback.error) {
      throw new Error(`Failed to load profiles: ${fallback.error.message}`);
    }

    profileRows = (fallback.data ?? []).map((row) => ({
      ...row,
      department_id: null,
    }));
  } else {
    throw new Error(`Failed to load profiles: ${primary.error.message}`);
  }

  const authInfo = await listAuthUserInfo();

  const scoped = filterVisibleProfiles(profileRows, access, scope);
  const departments = departmentOptions(scoped);

  const roleFilter = (APP_ROLES as readonly string[]).includes(role ?? "")
    ? (role as ProfileRole)
    : null;
  const departmentFilter =
    department && department.trim() ? department.trim() : null;
  const query = q.trim().toLocaleLowerCase("fa");

  const rows: AdminUserRow[] = scoped.map((row) => {
    const auth = authInfo.get(row.id);
    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      department: row.department,
      departmentId: row.department_id ?? null,
      employeeCode: row.employee_code,
      email: row.email,
      phone: auth?.phone ?? null,
      role: row.role,
      isActive: row.is_active,
      createdAt: row.created_at,
      lastSignInAt: auth?.lastSignInAt ?? null,
    };
  });

  const users = rows
    .filter((row) => (roleFilter ? row.role === roleFilter : true))
    .filter((row) =>
      departmentFilter
        ? row.department === departmentFilter ||
          row.departmentId === departmentFilter
        : true,
    )
    .filter((row) => {
      if (!query) return true;
      return [
        row.fullName,
        row.username,
        row.employeeCode ?? "",
        row.phone ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("fa")
        .includes(query);
    });

  const canManageUsers = access.scopes["users.manage"] === "all";
  const canManageOwners = access.isOwner;

  return {
    actorRole: toAppRole(access.role),
    actorId: access.userId,
    scope,
    canManageUsers,
    canManageOwners,
    assignableRoles: canManageUsers
      ? canManageOwners
        ? [...APP_ROLES]
        : (["employee", "manager", "ceo", "admin"] as AppRole[])
      : [],
    users,
    departments,
    filters: { role: roleFilter, department: departmentFilter, q },
    counts: {
      visible: users.length,
      active: users.filter((row) => row.isActive).length,
      managers: users.filter((row) => row.role === "manager").length,
    },
  };
}
