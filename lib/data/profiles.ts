import "server-only";

import type { ProfileRole } from "@/lib/supabase/models";
import { createClient } from "@/lib/supabase/server";

export type ScopedProfileRow = {
  id: string;
  full_name: string;
  department: string | null;
  department_id: string | null;
  employee_code: string | null;
  role: ProfileRole;
  is_active: boolean;
};

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Profiles for scoping/reporting. Falls back to the pre-teams shape (without
 * department_id) so the app keeps working until the migration is applied.
 */
export async function fetchScopedProfiles(
  supabase: Client,
): Promise<ScopedProfileRow[]> {
  const primary = await supabase
    .from("profiles")
    .select(
      "id, full_name, department, department_id, employee_code, role, is_active",
    );

  if (!primary.error) {
    return primary.data ?? [];
  }

  if (
    primary.error.code === "42703" ||
    primary.error.message.includes("department_id")
  ) {
    const fallback = await supabase
      .from("profiles")
      .select("id, full_name, department, employee_code, role, is_active")
      .order("full_name", { ascending: true });

    if (fallback.error) {
      throw new Error(`Failed to load profiles: ${fallback.error.message}`);
    }

    return (fallback.data ?? []).map((row) => ({
      ...row,
      department_id: null,
    }));
  }

  throw new Error(`Failed to load profiles: ${primary.error.message}`);
}
