export const APP_ROLES = [
  "employee",
  "manager",
  "ceo",
  "admin",
  "owner",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  employee: "کارمند",
  manager: "مدیر تیم",
  ceo: "مدیرعامل",
  admin: "مدیر سیستم",
  owner: "مالک",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  employee: "مشاهده منو، رزرو ناهار و سفارش سرویس‌ها",
  manager: "مشاهده اطلاعات تیم خود",
  ceo: "مشاهده همه تیم‌ها و گزارش‌ها (فقط‌خواندنی)",
  admin: "مدیریت منو، تنظیمات و گزارش‌های کل مجموعه",
  owner: "دسترسی کامل، از جمله کاربران، دسترسی‌ها و تیم‌ها",
};

export function toAppRole(value: string | null | undefined): AppRole {
  return APP_ROLES.includes(value as AppRole) ? (value as AppRole) : "employee";
}

/** manager, ceo, admin and owner can open at least one report. */
export function canViewReports(role: string): boolean {
  return (
    role === "manager" || role === "ceo" || role === "admin" || role === "owner"
  );
}

/** admin and owner can change the menu, overrides and service settings. */
export function canManageMenu(role: string): boolean {
  return role === "admin" || role === "owner";
}

/** anyone who may open some part of /admin. */
export function canAccessAdminPanel(role: string): boolean {
  return canViewReports(role) || role === "admin" || role === "owner";
}

/** only the owner can assign roles and manage accounts. */
export function isOwnerRole(role: string): boolean {
  return role === "owner";
}
