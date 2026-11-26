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
  employee: "مشاهده بخش‌های مجاز، رزرو ناهار و سفارش سرویس‌ها",
  manager: "دسترسی تیمی به گزارش‌ها و فعالیت اعضای تیم",
  ceo: "مشاهده همه تیم‌ها و گزارش‌ها (فقط‌خواندنی)",
  admin: "مدیریت محتوا، تنظیمات و گزارش‌های کل مجموعه",
  owner: "دسترسی کامل، از جمله کاربران، دسترسی‌ها و تیم‌ها",
};

export function toAppRole(value: string | null | undefined): AppRole {
  return APP_ROLES.includes(value as AppRole) ? (value as AppRole) : "employee";
}

/** only the owner can assign roles and manage accounts. */
export function isOwnerRole(role: string): boolean {
  return role === "owner";
}
