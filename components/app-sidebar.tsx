"use client";

import * as React from "react";
import { BarChart3Icon, Code, ShieldCheckIcon, User } from "lucide-react";

import {
  NavMain,
  type NavMainItem,
  type NavMainSubItem,
} from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ROLE_LABELS, toAppRole, type AppRole } from "@/lib/auth/roles";
import { SCOPE_TAGS, type Scope, type ScopeMap } from "@/lib/auth/scopes";

export type SidebarUser = {
  name: string;
  email: string;
  avatar?: string;
};

export type SidebarSections = {
  lunch: boolean;
  services: boolean;
  config: boolean;
  directory: boolean;
};

/**
 * Sidebar categories, filtered by capability scope:
 *   خدمات کارکنان  lunch/services/config/directory view capabilities
 *   گزارش‌ها       reports.* and team.activity
 *   مدیریت         menu/users/permissions capabilities
 */
function buildNav(
  role: AppRole,
  scopes: ScopeMap,
  sections: SidebarSections,
): NavMainItem[] {
  const nav: NavMainItem[] = [];

  const employeeItems: NavMainSubItem[] = [];

  if (sections.lunch) {
    employeeItems.push({
      title: "ناهار",
      isActive: true,
      slug: "lunch",
      tag: "رزرو",
    });
  }
  if (sections.services) {
    employeeItems.push({
      title: "سرویس‌ها",
      isActive: false,
      slug: "services",
      tag: "سفارش",
    });
  }
  if (sections.config) {
    employeeItems.push({
      title: "کانفیگ",
      isActive: false,
      slug: "config",
      tag: "اشتراک",
    });
  }
  if (sections.directory) {
    employeeItems.push({
      title: "همکاران",
      isActive: false,
      slug: "directory",
      url: "/directory",
      tag: "تماس",
    });
  }

  if (employeeItems.length > 0) {
    nav.push({
      title: "خدمات کارکنان",
      label: "خدمات کارکنان",
      url: "#",
      icon: <User />,
      isActive: true,
      items: employeeItems,
    });
  }

  const reportItems: NavMainSubItem[] = [];
  const lunchScope: Scope = scopes["reports.lunch"];
  const servicesScope: Scope = scopes["reports.services"];

  if (lunchScope !== "none") {
    reportItems.push({
      title: "گزارش ناهار",
      isActive: false,
      slug: "admin-report",
      url: "/admin",
      tag: SCOPE_TAGS[lunchScope],
    });
    reportItems.push({
      title: "لیست روز ناهار",
      isActive: false,
      slug: "admin-daily",
      url: "/admin/daily",
      tag: SCOPE_TAGS[lunchScope],
    });
  }
  if (servicesScope !== "none") {
    reportItems.push({
      title: "گزارش سرویس‌ها",
      isActive: false,
      slug: "admin-services",
      url: "/admin/services",
      tag: SCOPE_TAGS[servicesScope],
    });
  }
  if (scopes["team.activity"] !== "none") {
    reportItems.push({
      title: "فعالیت تیم",
      isActive: false,
      slug: "admin-team",
      url: "/admin/team",
      tag: SCOPE_TAGS[scopes["team.activity"]],
    });
  }

  if (reportItems.length > 0) {
    nav.push({
      title: "گزارش‌ها",
      label: "گزارش‌ها",
      tag: role === "manager" ? "تیم من" : "مجموعه",
      url: "#",
      icon: <BarChart3Icon />,
      isActive: false,
      items: reportItems,
    });
  }

  const adminItems: NavMainSubItem[] = [];

  if (scopes["menu.manage"] !== "none") {
    adminItems.push({
      title: "مدیریت منو",
      isActive: false,
      slug: "admin-menu",
      url: "/admin/menu",
      tag: "تنظیمات",
    });
  }

  if (scopes["services.manage"] !== "none") {
    adminItems.push({
      title: "مدیریت سرویس‌ها",
      isActive: false,
      slug: "admin-services-manage",
      url: "/admin/services#manage",
      tag: "سرویس‌ها",
    });
  }

  if (scopes["digital.manage"] !== "none") {
    adminItems.push({
      title: "مدیریت کانفیگ‌ها",
      isActive: false,
      slug: "admin-config",
      url: "/admin/config",
      tag: SCOPE_TAGS[scopes["digital.manage"]],
    });
  }

  const usersScope: Scope =
    scopes["users.manage"] !== "none" ? "all" : scopes["users.view"];
  if (usersScope !== "none") {
    adminItems.push({
      title: "کاربران و نقش‌ها",
      isActive: false,
      slug: "admin-users",
      url: "/admin/users",
      tag: SCOPE_TAGS[usersScope],
    });
  }

  if (
    scopes["permissions.manage"] !== "none" ||
    scopes["teams.manage"] !== "none"
  ) {
    adminItems.push({
      title: "دسترسی‌ها و تیم‌ها",
      isActive: false,
      slug: "admin-permissions",
      url: "/admin/permissions",
      tag: "مالک",
    });
  }

  if (adminItems.length > 0) {
    nav.push({
      title: "مدیریت",
      label: "مدیریت",
      tag: ROLE_LABELS[role],
      url: "#",
      icon: <ShieldCheckIcon />,
      isActive: false,
      items: adminItems,
    });
  }

  return nav;
}

export function AppSidebar({
  user,
  role,
  scopes,
  sections,
  teamManager,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: SidebarUser;
  role: string;
  scopes: ScopeMap;
  sections: SidebarSections;
  teamManager?: boolean;
}) {
  const appRole = toAppRole(role);
  const nav = React.useMemo(
    () => buildNav(appRole, scopes, sections),
    [appRole, scopes, sections],
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <a
          href="#"
          className="flex items-center gap-3 mx-2 group-data-[collapsible=icon]:mx-0 group-data-[collapsible=icon]:justify-center"
        >
          <Code className="size-5! shrink-0" />
          <span className="text-base font-semibold text-primary group-data-[collapsible=icon]:hidden">
            کوروش پارس
          </span>
        </a>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={nav} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} role={role} teamManager={teamManager} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}