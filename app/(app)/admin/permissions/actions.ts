"use server";

import { revalidatePath } from "next/cache";

import {
  CAPABILITIES,
  CATEGORY_MODULES,
  isScopeAllowed,
  toScope,
} from "@/lib/auth/scopes";
import type { Capability, Scope } from "@/lib/auth/scopes";
import { requireFullCapability } from "@/lib/auth/permissions";
import { APP_ROLES } from "@/lib/auth/roles";
import type { AdminFormState } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase/server";

const TEAM_NAME_MIN = 2;
const TEAM_NAME_MAX = 80;

type GrantMode = "grant" | "deny";

type GrantPayload = {
  capability: string;
  category_id?: string | null;
  mode: GrantMode;
  scope: Scope;
};

function field(formData: FormData, name: string, maxLength = 160): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, maxLength);
}

function refresh() {
  revalidatePath("/admin/permissions");
  revalidatePath("/admin/permissions/teams");
  revalidatePath("/admin/permissions/people");
  revalidatePath("/admin");
  revalidatePath("/");
}

function parseChoice(raw: unknown, capability: Capability): GrantPayload | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  if (value === "deny") {
    return { capability, mode: "deny", scope: "none" };
  }

  const scope = toScope(value);
  if (scope === "none" || !isScopeAllowed(capability, scope)) {
    return null;
  }

  return { capability, mode: "grant", scope };
}

/**
 * Builds the grant payload for one subject from the form fields:
 *   `${prefix}:${capability}`       -> inherited / deny / scope
 *   `${prefix}:cat:${capability}:${categoryId}` -> inherited / grant / deny
 */
function readSubjectGrants(
  formData: FormData,
  prefix: string,
): GrantPayload[] {
  const grants: GrantPayload[] = [];

  for (const capability of CAPABILITIES) {
    const choice = parseChoice(formData.get(`${prefix}:${capability}`), capability);

    if (choice) {
      grants.push(choice);
    }

    const categoryModule = CATEGORY_MODULES[capability];
    if (!categoryModule) continue;

    const marker = `${prefix}:cat:${capability}:`;
    for (const [key, raw] of formData.entries()) {
      if (!key.startsWith(marker)) continue;

      const categoryId = key.slice(marker.length);
      if (!categoryId) continue;

      const value = String(raw);
      if (value === "grant") {
        grants.push({
          capability,
          category_id: categoryId,
          mode: "grant",
          scope: choice?.mode === "grant" ? choice.scope : "all",
        });
      } else if (value === "deny") {
        grants.push({
          capability,
          category_id: categoryId,
          mode: "deny",
          scope: "none",
        });
      }
    }
  }

  return grants;
}

export async function saveRoleGrants(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("permissions.manage");

  const supabase = await createClient();
  let saved = 0;

  for (const role of APP_ROLES) {
    if (role === "owner") continue;

    const grants: GrantPayload[] = [];

    for (const capability of CAPABILITIES) {
      const raw = formData.get(`role:${role}:${capability}`);
      const choice = parseChoice(raw, capability);
      if (choice) grants.push(choice);
    }

    const { error } = await supabase.rpc("set_role_grants", {
      p_role: role,
      p_grants: grants,
    });

    if (error) {
      console.error("saveRoleGrants failed", error);
      return { error: "ذخیره ماتریس نقش‌ها انجام نشد." };
    }
    saved += 1;
  }

  if (saved === 0) {
    return { error: "نقشی برای ذخیره پیدا نشد." };
  }

  refresh();
  return { ok: "ماتریس نقش‌ها ذخیره شد." };
}

export async function saveTeamGrants(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("permissions.manage");

  const teamId = field(formData, "team_id", 40);
  const target = field(formData, "target", 20);

  if (!teamId) {
    return { error: "تیم نامعتبر است." };
  }
  if (target !== "member" && target !== "manager") {
    return { error: "نوع دسترسی نامعتبر است." };
  }

  const subjectType = target === "member" ? "team" : "team_manager";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_subject_grants", {
    p_subject_type: subjectType,
    p_department_id: teamId,
    p_user_id: null,
    p_grants: readSubjectGrants(formData, target),
  });

  if (error) {
    console.error("saveTeamGrants failed", error);
    return { error: "ذخیره دسترسی تیم انجام نشد." };
  }

  refresh();
  return {
    ok: target === "member" ? "دسترسی اعضا ذخیره شد." : "دسترسی مدیر ذخیره شد.",
  };
}

export async function saveUserGrants(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("permissions.manage");

  const userId = field(formData, "user_id", 40);
  if (!userId) {
    return { error: "کاربر نامعتبر است." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_subject_grants", {
    p_subject_type: "user",
    p_department_id: null,
    p_user_id: userId,
    p_grants: readSubjectGrants(formData, "user"),
  });

  if (error) {
    console.error("saveUserGrants failed", error);
    return { error: "ذخیره استثناهای کاربر انجام نشد." };
  }

  refresh();
  return { ok: "استثناهای دسترسی کاربر ذخیره شد." };
}

export async function clearUserGrants(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("permissions.manage");

  const userId = field(formData, "user_id", 40);
  if (!userId) {
    return { error: "کاربر نامعتبر است." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_subject_grants", {
    p_subject_type: "user",
    p_department_id: null,
    p_user_id: userId,
    p_grants: [],
  });

  if (error) {
    console.error("clearUserGrants failed", error);
    return { error: "حذف استثناها انجام نشد." };
  }

  refresh();
  return { ok: "همه استثناهای این کاربر حذف شد." };
}

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------
const CATEGORY_SLUG = /^[a-z0-9-]{2,40}$/;

export async function createCategory(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("permissions.manage");

  const categoryModule = field(formData, "module", 40);
  const slug = field(formData, "slug", 40).toLowerCase();
  const name = field(formData, "name", 80);
  const description = field(formData, "description", 160) || null;
  const sortOrder = Number(field(formData, "sort_order", 6)) || 0;

  if (!categoryModule || !CATEGORY_SLUG.test(slug)) {
    return {
      error: "شناسه دسته باید ۲ تا ۴۰ کاراکتر انگلیسی، عدد یا خط تیره باشد.",
    };
  }
  if (name.length < 2) {
    return { error: "نام دسته باید حداقل ۲ کاراکتر باشد." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("access_categories").insert({
    module: categoryModule,
    slug,
    name,
    description,
    sort_order: sortOrder,
  });

  if (error) {
    console.error("createCategory failed", error);
    if (error.code === "23505") {
      return { error: "دسته‌ای با این شناسه در این ماژول وجود دارد." };
    }
    return { error: "ساخت دسته انجام نشد." };
  }

  refresh();
  return { ok: `دسته «${name}» ساخته شد.` };
}

export async function updateCategory(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("permissions.manage");

  const categoryId = field(formData, "category_id", 40);
  const name = field(formData, "name", 80);
  const description = field(formData, "description", 160) || null;
  const sortOrder = Number(field(formData, "sort_order", 6)) || 0;
  const isActive = String(formData.get("is_active") ?? "") === "on";

  if (!categoryId || name.length < 2) {
    return { error: "اطلاعات دسته کامل نیست." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("access_categories")
    .update({ name, description, sort_order: sortOrder, is_active: isActive })
    .eq("id", categoryId);

  if (error) {
    console.error("updateCategory failed", error);
    return { error: "ذخیره دسته انجام نشد." };
  }

  refresh();
  return { ok: "دسته ذخیره شد." };
}

export async function deleteCategory(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireFullCapability("permissions.manage");

  const categoryId = field(formData, "category_id", 40);
  if (!categoryId) {
    return { error: "دسته نامعتبر است." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("access_categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    console.error("deleteCategory failed", error);
    return { error: "حذف دسته انجام نشد." };
  }

  refresh();
  return { ok: "دسته حذف شد و دسترسی‌های مرتبط با آن پاک شدند." };
}

// ---------------------------------------------------------------------------
// teams
// ---------------------------------------------------------------------------
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