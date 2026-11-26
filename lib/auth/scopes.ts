/** Client-safe capability and scope catalogue (no server-only imports). */

import type { AppRole } from "@/lib/auth/roles";

export const CAPABILITIES = [
  "reports.lunch",
  "reports.services",
  "team.activity",
  "lunch.view",
  "services.view",
  "config.view",
  "directory.view",
  "users.view",
  "menu.manage",
  "lunch.manage",
  "services.manage",
  "users.manage",
  "permissions.manage",
  "teams.manage",
  "digital.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const SCOPES = ["none", "self", "team", "all"] as const;
export type Scope = (typeof SCOPES)[number];
export type ScopeMap = Record<Capability, Scope>;

export const CAPABILITY_LABELS: Record<Capability, string> = {
  "reports.lunch": "گزارش ناهار",
  "reports.services": "گزارش سرویس‌ها",
  "team.activity": "فعالیت تیم",
  "lunch.view": "بخش ناهار",
  "services.view": "بخش سرویس‌ها",
  "config.view": "بخش کانفیگ",
  "directory.view": "فهرست همکاران",
  "users.view": "مشاهده کاربران",
  "menu.manage": "مدیریت منو و تنظیمات ناهار",
  "lunch.manage": "لیست روز و رزرو برای دیگران",
  "services.manage": "مدیریت سرویس‌ها",
  "users.manage": "ساخت و ویرایش کاربران",
  "permissions.manage": "مدیریت دسترسی‌ها",
  "teams.manage": "مدیریت تیم‌ها",
  "digital.manage": "مدیریت کانفیگ‌ها",
};

export const CAPABILITY_DESCRIPTIONS: Record<Capability, string> = {
  "reports.lunch": "دیدن رزروها و هزینه ناهار",
  "reports.services": "دیدن سفارش‌ها و هزینه سرویس‌ها",
  "team.activity": "دیدن خلاصه و رخدادهای فعالیت اعضای تیم",
  "lunch.view": "دیدن منوی ناهار و رزرو برای خود",
  "services.view": "دیدن و سفارش سرویس‌های رفاهی",
  "config.view": "دیدن کانفیگ‌های شخصی و ساخت اشتراک",
  "directory.view": "دیدن شماره تماس و واحد همکاران",
  "users.view": "دیدن فهرست کاربران",
  "menu.manage": "ویرایش منوی هفتگی، استثناها و قیمت ناهار",
  "lunch.manage": "دیدن لیست روز و افزودن یا لغو رزرو کارکنان",
  "services.manage": "افزودن و ویرایش سرویس‌ها (قهوه، چای، …)",
  "users.manage": "ساخت، ویرایش و حذف حساب‌ها",
  "permissions.manage": "تغییر جدول دسترسی نقش‌ها، تیم‌ها و افراد",
  "teams.manage": "ساخت تیم و تعیین مدیر تیم",
  "digital.manage": "ساخت اشتراک V2Ray، انتخاب نود و سهمیه کارمندان",
};

/** Scopes a grant may use for each capability. */
export const CAPABILITY_SCOPES: Record<Capability, Scope[]> = {
  "reports.lunch": ["none", "self", "team", "all"],
  "reports.services": ["none", "self", "team", "all"],
  "team.activity": ["none", "team", "all"],
  "lunch.view": ["none", "all"],
  "services.view": ["none", "all"],
  "config.view": ["none", "all"],
  "directory.view": ["none", "all"],
  "users.view": ["none", "self", "team", "all"],
  "menu.manage": ["none", "all"],
  "lunch.manage": ["none", "all"],
  "services.manage": ["none", "all"],
  "users.manage": ["none", "all"],
  "permissions.manage": ["none", "all"],
  "teams.manage": ["none", "all"],
  "digital.manage": ["none", "team", "all"],
};

/** Capabilities that only make sense with the "all" scope. */
export const FULL_ONLY_CAPABILITIES: readonly Capability[] =
  CAPABILITIES.filter(
    (capability) => !CAPABILITY_SCOPES[capability].includes("team"),
  );

/** Capabilities that may carry per-category grants, and their data module. */
export const CATEGORY_MODULES: Partial<Record<Capability, string>> = {
  "lunch.view": "lunch",
  "menu.manage": "lunch",
  "reports.lunch": "lunch",
  "services.view": "services",
  "services.manage": "services",
  "reports.services": "services",
};

export const CATEGORY_MODULE_LABELS: Record<string, string> = {
  services: "سرویس‌های رفاهی",
  lunch: "منوی ناهار",
};

export const CATEGORY_MODULE_CAPABILITIES = Object.keys(
  CATEGORY_MODULES,
) as Capability[];

/** Capabilities that open some part of the admin area. */
export const ADMIN_AREA_CAPABILITIES: Capability[] = [
  "reports.lunch",
  "reports.services",
  "team.activity",
  "users.view",
  "menu.manage",
  "lunch.manage",
  "services.manage",
  "users.manage",
  "permissions.manage",
  "teams.manage",
  "digital.manage",
];

export const EMPLOYEE_SECTION_CAPABILITIES: Capability[] = [
  "lunch.view",
  "services.view",
  "config.view",
  "directory.view",
];

export const CAPABILITY_GROUPS: {
  title: string;
  capabilities: Capability[];
}[] = [
  {
    title: "خدمات کارکنان",
    capabilities: [
      "lunch.view",
      "services.view",
      "config.view",
      "directory.view",
    ],
  },
  {
    title: "گزارش‌ها و تیم",
    capabilities: ["reports.lunch", "reports.services", "team.activity"],
  },
  { title: "ناهار", capabilities: ["menu.manage", "lunch.manage"] },
  { title: "سرویس‌ها", capabilities: ["services.manage"] },
  { title: "کاربران", capabilities: ["users.view", "users.manage"] },
  {
    title: "مدیریت سامانه",
    capabilities: ["permissions.manage", "teams.manage"],
  },
  { title: "خدمات دیجیتال", capabilities: ["digital.manage"] },
];

export const SCOPE_LABELS: Record<Scope, string> = {
  none: "بدون دسترسی",
  self: "خودم",
  team: "تیم من",
  all: "همه",
};

export const SCOPE_TAGS: Record<Scope, string> = {
  none: "—",
  self: "خودم",
  team: "تیم من",
  all: "همه",
};

const SCOPE_ORDER: Record<Scope, number> = {
  none: 0,
  self: 1,
  team: 2,
  all: 3,
};

export function scopeRank(scope: Scope | null | undefined): number {
  return SCOPE_ORDER[scope ?? "none"] ?? 0;
}

export function maxScope(...scopes: Scope[]): Scope {
  return scopes.reduce<Scope>(
    (widest, scope) => (scopeRank(scope) > scopeRank(widest) ? scope : widest),
    "none",
  );
}

export function emptyScopes(): ScopeMap {
  return Object.fromEntries(
    CAPABILITIES.map((capability) => [capability, "none"]),
  ) as ScopeMap;
}

export function allScopes(): ScopeMap {
  return Object.fromEntries(
    CAPABILITIES.map((capability) => [capability, "all"]),
  ) as ScopeMap;
}

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function toScope(value: string | null | undefined): Scope {
  return (SCOPES as readonly string[]).includes(value ?? "")
    ? (value as Scope)
    : "none";
}

export function isScopeAllowed(capability: Capability, scope: Scope): boolean {
  return CAPABILITY_SCOPES[capability].includes(scope);
}

export function categoryModuleFor(
  capability: Capability,
): string | undefined {
  return CATEGORY_MODULES[capability];
}

/** Default matrix, mirrored in the layered-access SQL migration. */
export const ROLE_DEFAULT_SCOPES: Record<AppRole, ScopeMap> = {
  employee: {
    ...emptyScopes(),
    "lunch.view": "all",
    "services.view": "all",
    "config.view": "all",
    "directory.view": "all",
  },
  manager: {
    ...emptyScopes(),
    "reports.lunch": "team",
    "reports.services": "team",
    "team.activity": "team",
    "lunch.view": "all",
    "services.view": "all",
    "config.view": "all",
    "directory.view": "all",
    "users.view": "team",
    "digital.manage": "team",
  },
  ceo: {
    ...emptyScopes(),
    "reports.lunch": "all",
    "reports.services": "all",
    "team.activity": "all",
    "lunch.view": "all",
    "services.view": "all",
    "config.view": "all",
    "directory.view": "all",
    "users.view": "all",
  },
  admin: {
    ...emptyScopes(),
    "reports.lunch": "all",
    "reports.services": "all",
    "team.activity": "all",
    "lunch.view": "all",
    "services.view": "all",
    "config.view": "all",
    "directory.view": "all",
    "menu.manage": "all",
    "lunch.manage": "all",
    "services.manage": "all",
    "digital.manage": "all",
  },
  owner: allScopes(),
};