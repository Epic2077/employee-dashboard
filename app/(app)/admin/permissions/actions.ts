"use server";

import { revalidatePath } from "next/cache";

import {
  CAPABILITY_LABELS,
  FULL_ONLY_CAPABILITIES,
  isCapability,
  toScope,
} from "@/lib/auth/scopes";
import { requireFullCapability } from "@/lib/auth/permissions";
import { APP_ROLES } from "@/lib/auth/roles";
import type { AdminFormState } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type PermissionInsert =
  Database["public"]["Tables"]["role_permissions"]["Insert"];

const TEAM_NAME_MIN = 2;
const TEAM_NAME_MAX = 80;

function field(formData: FormData, name: string, maxLength = 160): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, maxLength);
}

function refresh() {
  revalidatePath("/admin/permissions");
  revalidatePath("/admin");
  revalidatePath("/");
}

/**
 * Saves the whole role x capability matrix in one submit.
 * Field names are `scope:<role>:<capability>`.
 */
export async function savePermissionsMatrix(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("permissions.manage");

  const rows: PermissionInsert[] = [];

  for (const role of APP_ROLES) {
    for (const [key, raw] of formData.entries()) {
      if (!key.startsWith(`scope:${role}:`)) continue;

      const capability = key.slice(`scope:${role}:`.length);
      if (!isCapability(capability)) continue;

      const scope = toScope(String(raw));
      const fullOnly = FULL_ONLY_CAPABILITIES.includes(capability);

      if (fullOnly && scope !== "none" && scope !== "all") {
        return {
          error: `«${CAPABILITY_LABELS[capability]}» فقط می‌تواند «بدون دسترسی» یا «همه» باشد.`,
        };
      }

      rows.push({ role, capability, scope });
    }
  }

  if (rows.length === 0) {
    return { error: "تغییری برای ذخیره پیدا نشد." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("role_permissions")
    .upsert(rows, { onConflict: "role,capability" });

  if (error) {
    console.error("savePermissionsMatrix failed", error);
    return { error: "ذخیره دسترسی‌ها انجام نشد." };
  }

  refresh();
  return { ok: "دسترسی‌ها ذخیره شد؛ با بارگذاری بعدی صفحه اعمال می‌شود." };
}

export async function createTeam(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("teams.manage");

  const name = field(formData, "name", TEAM_NAME_MAX);
  const managerId = field(formData, "manager_id", 40);

  if (name.length < TEAM_NAME_MIN) {
    return { error: "نام تیم باید حداقل ۲ کاراکتر باشد." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .insert({ name, manager_id: managerId || null });

  if (error) {
    console.error("createTeam failed", error);
    if (error.code === "23505") {
      return { error: "تیمی با این نام از قبل وجود دارد." };
    }
    return { error: "ساخت تیم انجام نشد." };
  }

  refresh();
  return { ok: `تیم «${name}» ساخته شد.` };
}

export async function updateTeam(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("teams.manage");

  const teamId = field(formData, "team_id", 40);
  const name = field(formData, "name", TEAM_NAME_MAX);
  const managerId = field(formData, "manager_id", 40);

  if (!teamId) {
    return { error: "تیم نامعتبر است." };
  }
  if (name.length < TEAM_NAME_MIN) {
    return { error: "نام تیم باید حداقل ۲ کاراکتر باشد." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({ name, manager_id: managerId || null })
    .eq("id", teamId);

  if (error) {
    console.error("updateTeam failed", error);
    if (error.code === "23505") {
      return { error: "تیمی با این نام از قبل وجود دارد." };
    }
    return { error: "ذخیره تیم انجام نشد." };
  }

  refresh();
  return { ok: "تیم ذخیره شد." };
}

export async function deleteTeam(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("teams.manage");

  const teamId = field(formData, "team_id", 40);
  if (!teamId) {
    return { error: "تیم نامعتبر است." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", teamId);

  if (error) {
    console.error("deleteTeam failed", error);
    return { error: "حذف تیم انجام نشد." };
  }

  refresh();
  return { ok: "تیم حذف شد." };
}
