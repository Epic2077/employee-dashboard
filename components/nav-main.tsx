"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type NavMainSubItem = {
  title: string;
  url?: string;
  isActive: boolean;
  slug: string;
  /** Small badge rendered at the end of the row (e.g. گزارش، تنظیمات). */
  tag?: string;
};

export type NavMainItem = {
  title: string;
  url: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  /** Category heading shown above this group. */
  label?: string;
  /** Badge shown next to the category heading (e.g. the current role). */
  tag?: string;
  items?: NavMainSubItem[];
};

function CategoryLabel({ item }: { item: NavMainItem }) {
  return (
    <SidebarGroupLabel>
      <span>{item.label ?? "داخلی"}</span>
      {item.tag ? (
        <span className="ms-auto rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[9px] font-medium text-sidebar-foreground/80">
          {item.tag}
        </span>
      ) : null}
    </SidebarGroupLabel>
  );
}

export function NavMain({
  items,
  defaultTab = "lunch",
}: {
  items: NavMainItem[];
  defaultTab?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar();

  // No hover tooltips inside the mobile sheet, and the sheet is always wide.
  const collapsed = state === "collapsed" && !isMobile;

  // The home tab lives in `?tab=` and the sidebar follows the URL instead of
  // keeping its own state, so it stays correct across refreshes.
  const requestedTab = searchParams.get("tab") ?? defaultTab;
  // Keep in sync with TABS in components/tabs/tab-content.tsx.
  const currentTab = ["lunch", "services", "config"].includes(requestedTab)
    ? requestedTab
    : defaultTab;

  // Route links follow the pathname; tab links (`?tab=`) only count on the home page.
  const isSubItemActive = (subItem: NavMainSubItem) => {
    if (subItem.url && subItem.url.startsWith("/")) {
      const [target, hash] = subItem.url.split("#");
      // "/page#section" links are cross-links to a section, not a tab.
      return hash ? false : pathname === target;
    }
    return pathname === "/" && currentTab === subItem.slug;
  };

  // Tab links are real URLs (`/?tab=services`), so the selected tab survives
  // a refresh. Lunch month params (`y`, `m`) are carried over when switching.
  const hrefFor = (subItem: NavMainSubItem) => {
    if (subItem.url) {
      return subItem.url;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", subItem.slug);
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  if (collapsed) {
    return (
      <>
        {items.map((item) => {
          const primary = item.items?.[0] ?? null;
          const href = primary ? hrefFor(primary) : null;
          const isActive = primary ? isSubItemActive(primary) : false;

          return (
            <SidebarGroup key={item.title}>
              <CategoryLabel item={item} />
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={
                      primary ? `${item.title} — ${primary.title}` : item.title
                    }
                    onClick={() => {
                      if (!primary) {
                        setOpen(true);
                      }
                    }}
                    render={
                      href ? (
                        <Link href={href} aria-label={item.title} />
                      ) : undefined
                    }
                  >
                    {item.icon}
                    <span className="sr-only">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </>
    );
  }

  return (
    <>
      {items.map((item) => (
        <NavGroup
          key={item.title}
          item={item}
          isSubItemActive={isSubItemActive}
          hrefFor={hrefFor}
          onNavigate={() => {
            if (isMobile) setOpenMobile(false);
          }}
        />
      ))}
    </>
  );
}

function NavGroup({
  item,
  isSubItemActive,
  hrefFor,
  onNavigate,
}: {
  item: NavMainItem;
  isSubItemActive: (subItem: NavMainSubItem) => boolean;
  hrefFor: (subItem: NavMainSubItem) => string;
  onNavigate: () => void;
}) {
  const hasActiveChild = Boolean(item.items?.some(isSubItemActive));
  // Controlled on purpose: the active child changes after navigation, and an
  // uncontrolled Collapsible must not change its defaultOpen after mount.
  // The group with the current page always stays open.
  const [userOpen, setUserOpen] = useState(Boolean(item.isActive));
  const open = userOpen || hasActiveChild;

  return (
    <SidebarGroup>
      <CategoryLabel item={item} />
      <SidebarMenu>
        <Collapsible
          open={open}
          onOpenChange={setUserOpen}
          className="group/collapsible"
          render={<SidebarMenuItem />}
        >
          <CollapsibleTrigger
            render={<SidebarMenuButton tooltip={item.title} />}
          >
            {item.icon}
            <span className="truncate">{item.title}</span>
            <ChevronRightIcon className="ms-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.items?.map((subItem) => {
                const isCurrent = isSubItemActive(subItem);
                const href = hrefFor(subItem);
                return (
                  <SidebarMenuSubItem key={subItem.title}>
                    <SidebarMenuSubButton
                      isActive={isCurrent}
                      render={
                        <Link
                          href={href}
                          aria-current={isCurrent ? "page" : undefined}
                          onClick={onNavigate}
                        />
                      }
                    >
                      <span className="truncate">{subItem.title}</span>
                      {subItem.tag ? (
                        <span className="ms-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground ring-1 ring-border">
                          {subItem.tag}
                        </span>
                      ) : null}
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenu>
    </SidebarGroup>
  );
}
