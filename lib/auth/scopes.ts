/** Client-safe capability and scope catalogue (no server-only imports). */

import type { AppRole } from "@/lib/auth/roles";

export const CAPABILITIES = [
  "reports.lunch",
  "reports.services",
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
  "users.view": "دیدن فهرست کاربران",
  "menu.manage": "ویرایش منوی هفتگی، استثناها و قیمت ناهار",
  "lunch.manage": "دیدن لیست روز و افزودن یا لغو رزرو کارکنان",
  "services.manage": "افزودن و ویرایش سرویس‌ها (قهوه، چای، …)",
  "users.manage": "ساخت، ویرایش و حذف حساب‌ها",
  "permissions.manage": "تغییر جدول دسترسی نقش‌ها",
  "teams.manage": "ساخت تیم و تعیین مدیر تیم",
  "digital.manage": "ساخت اشتراک V2Ray، انتخاب نود و سهمیه کارمندان",
};

/** Capabilities that only make sense with the "all" scope. */
export const FULL_ONLY_CAPABILITIES: readonly Capability[] = [
  "menu.manage",
  "lunch.manage",
  "services.manage",
  "users.manage",
  "permissions.manage",
  "teams.manage",
];

export const CAPABILITY_GROUPS: {
  title: string;
  capabilities: Capability[];
}[] = [
  {
    title: "گزارش‌ها",
    capabilities: ["reports.lunch", "reports.services"],
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

/** Default matrix, mirrored in the teams/permissions SQL migration. */
export const ROLE_DEFAULT_SCOPES: Record<AppRole, ScopeMap> = {
  employee: emptyScopes(),
  manager: {
    ...emptyScopes(),
    "reports.lunch": "team",
    "reports.services": "team",
    "users.view": "team",
    "digital.manage": "team",
  },
  ceo: {
    ...emptyScopes(),
    "reports.lunch": "all",
    "reports.services": "all",
    "users.view": "all",
  },
  admin: {
    ...emptyScopes(),
    "reports.lunch": "all",
    "reports.services": "all",
    "menu.manage": "all",
    "lunch.manage": "all",
    "services.manage": "all",
    "digital.manage": "all",
  },
  owner: allScopes(),
};
