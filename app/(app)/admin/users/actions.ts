"use server";

import { revalidatePath } from "next/cache";

import { employeeEmailFor } from "@/lib/auth/employee-email";
import { requireFullCapability } from "@/lib/auth/permissions";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";
import type { AdminFormState } from "@/lib/admin/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

const EMAIL_CODE = /^[a-zA-Z0-9._-]{2,24}$/;
const PHONE = /^[+\d][\d\s()-]{5,19}$/;

async function requireUserManager() {
  const access = await requireFullCapability("users.manage");
  return { id: access.userId, role: access.role };
}

/**
 * Map a free-text department to a departments row. Returns undefined when the
 * teams migration has not been applied yet, so the caller can skip the column.
 */
async function resolveDepartmentId(
  admin: ReturnType<typeof createAdminClient>,
  name: string,
): Promise<string | null | undefined> {
  if (!name) {
    return null;
  }

  const { data, error } = await admin
    .from("departments")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (error) {
    return undefined;
  }

  return data?.id ?? null;
}

function field(formData: FormData, name: string, maxLength = 160): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, maxLength);
}

function refresh() {
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

function canManageRole(actorRole: string, targetRole: string): boolean {
  return actorRole === "owner" || targetRole !== "owner";
}

async function ensureNotLastOwner(
  admin: ReturnType<typeof createAdminClient>,
  targetRole: string,
  nextRole: string,
): Promise<string | null> {
  if (targetRole !== "owner" || nextRole === "owner") {
    return null;
  }

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "owner");
  if ((data?.length ?? 0) <= 1) {
    return "حداقل یک مالک باید باقی بماند.";
  }
  return null;
}

export async function createAdminUser(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await requireUserManager();

  const username = field(formData, "username", 60);
  const fullName = field(formData, "full_name", 80);
  const employeeCode = field(formData, "employee_code", 24).toLowerCase();
  const department = field(formData, "department", 80);
  const phone = field(formData, "phone", 20);
  const password = String(formData.get("password") ?? "");
  const role = field(formData, "role", 20) as AppRole;

  if (username.length < 2) {
    return { error: "نام کاربری باید حداقل ۲ کاراکتر باشد." };
  }
  if (!fullName) {
    return { error: "نام و نام خانوادگی الزامی است." };
  }
  if (!EMAIL_CODE.test(employeeCode)) {
    return {
      error:
        "کد پرسنلی باید ۲ تا ۲۴ کاراکتر انگلیسی، عدد، نقطه یا خط تیره باشد.",
    };
  }
  if (phone && !PHONE.test(phone)) {
    return { error: "شماره تلفن معتبر نیست." };
  }
  if (!APP_ROLES.includes(role)) {
    return { error: "نقش انتخاب‌شده معتبر نیست." };
  }
  if (role === "owner" && actor.role !== "owner") {
    return { error: "فقط مالک می‌تواند نقش مالک تعیین کند." };
  }
  if (password.length < 6) {
    return { error: "رمز عبور اولیه باید حداقل ۶ کاراکتر باشد." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: employeeEmailFor(employeeCode),
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: {
      username,
      full_name: fullName,
      employee_code: employeeCode,
      department: department || null,
      phone: phone || null,
    },
  });
  if (error) {
    console.error("createAdminUser failed", error);
    if (/already|registered|duplicate/i.test(error.message)) {
      return { error: "این کد پرسنلی یا نام کاربری قبلاً ثبت شده است." };
    }
    return { error: "ایجاد کاربر انجام نشد. مشخصات را بررسی کنید." };
  }

  // The auth trigger creates the profile, but its role/fields are not always
  // populated from metadata, so write them explicitly with the service role.
  const userId = data.user?.id;
  if (!userId) {
    return { error: "حساب ساخته شد اما شناسه کاربر دریافت نشد." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      employee_code: employeeCode,
      email: employeeEmailFor(employeeCode),
      department: department || null,
      role,
      is_active: true,
      must_change_password: true,
    })
    .eq("id", userId);

  if (profileError) {
    console.error("createAdminUser profile failed", profileError);
    return { error: "حساب ساخته شد اما پروفایل کامل نشد؛ دوباره ذخیره کنید." };
  }

  const departmentId = await resolveDepartmentId(admin, department);
  if (departmentId !== undefined) {
    const patch: Database["public"]["Tables"]["profiles"]["Update"] = {
      department_id: departmentId,
    };
    const { error: departmentError } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", userId);

    if (departmentError) {
      console.error("createAdminUser department failed", departmentError);
    }
  }

  refresh();
  return {
    ok: `حساب ${username} ساخته شد. رمز اولیه را به کارمند اطلاع دهید.`,
  };
}

export async function updateAdminUser(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await requireUserManager();

  const userId = field(formData, "user_id", 40);
  const fullName = field(formData, "full_name", 80);
  const department = field(formData, "department", 80);
  const phone = field(formData, "phone", 20);
  const role = field(formData, "role", 20) as AppRole;
  const isActive = formData.get("is_active") === "on";

  if (!userId) {
    return { error: "کاربر نامعتبر است." };
  }
  if (!fullName) {
    return { error: "نام و نام خانوادگی الزامی است." };
  }
  if (phone && !PHONE.test(phone)) {
    return { error: "شماره تلفن معتبر نیست." };
  }
  if (!APP_ROLES.includes(role)) {
    return { error: "نقش انتخاب‌شده معتبر نیست." };
  }

  const admin = createAdminClient();

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return { error: "کاربر پیدا نشد." };
  }

  if (!canManageRole(actor.role, target.role)) {
    return { error: "فقط مالک می‌تواند حساب مالک را تغییر دهد." };
  }
  if (role === "owner" && actor.role !== "owner") {
    return { error: "فقط مالک می‌تواند نقش مالک تعیین کند." };
  }
  if (userId === actor.id && role !== actor.role) {
    return { error: "نمی‌توانید نقش خودتان را تغییر دهید." };
  }
  if (userId === actor.id && !isActive) {
    return { error: "نمی‌توانید حساب خودتان را غیرفعال کنید." };
  }

  const lastOwnerError = await ensureNotLastOwner(admin, target.role, role);
  if (lastOwnerError) {
    return { error: lastOwnerError };
  }

  const { data: authUser, error: authUserError } =
    await admin.auth.admin.getUserById(userId);

  if (authUserError || !authUser.user) {
    return { error: "خواندن کاربر از سرویس احراز هویت انجام نشد." };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...(authUser.user.app_metadata ?? {}), role },
    user_metadata: {
      ...(authUser.user.user_metadata ?? {}),
      full_name: fullName,
      department: department || null,
      phone: phone || null,
    },
  });

  if (authError) {
    console.error("updateAdminUser auth failed", authError);
    return { error: "ذخیره اطلاعات در سرویس احراز هویت انجام نشد." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      department: department || null,
      role,
      is_active: isActive,
    })
    .eq("id", userId);

  if (profileError) {
    console.error("updateAdminUser profile failed", profileError);
    return { error: "ذخیره پروفایل انجام نشد." };
  }

  const departmentId = await resolveDepartmentId(admin, department);
  if (departmentId !== undefined) {
    const patch: Database["public"]["Tables"]["profiles"]["Update"] = {
      department_id: departmentId,
    };
    const { error: departmentError } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", userId);

    if (departmentError) {
      console.error("updateAdminUser department failed", departmentError);
    }
  }

  refresh();
  return {
    ok:
      role === target.role
        ? "اطلاعات کاربر ذخیره شد."
        : "نقش ذخیره شد؛ کاربر باید یک‌بار خارج و وارد شود.",
  };
}

export async function deleteAdminUser(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await requireUserManager();

  const userId = field(formData, "user_id", 40);
  if (!userId) {
    return { error: "کاربر نامعتبر است." };
  }
  if (userId === actor.id) {
    return { error: "نمی‌توانید حساب خودتان را حذف کنید." };
  }

  const admin = createAdminClient();

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("role, username")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return { error: "کاربر پیدا نشد." };
  }
  if (!canManageRole(actor.role, target.role)) {
    return { error: "فقط مالک می‌تواند حساب مالک را حذف کند." };
  }

  const lastOwnerError = await ensureNotLastOwner(
    admin,
    target.role,
    "employee",
  );
  if (lastOwnerError) {
    return { error: lastOwnerError };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("deleteAdminUser failed", error);
    return { error: "حذف کاربر انجام نشد." };
  }

  refresh();
  return { ok: `حساب ${target.username} حذف شد.` };
}
