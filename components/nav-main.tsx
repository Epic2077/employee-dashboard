"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [active, setActive] = useState(defaultTab);
  const pathname = usePathname();
  const { state, isMobile, setOpen } = useSidebar();

  // No hover tooltips inside the mobile sheet, and the sheet is always wide.
  const collapsed = state === "collapsed" && !isMobile;

  useEffect(() => {
    const syncHash = () => {
      const cleaned = window.location.hash.replace(/^#/, "");
      if (cleaned) {
        setActive(cleaned);
      }
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  // Route links follow the pathname; tab links (hash) only count on the home page.
  const isSubItemActive = (subItem: NavMainSubItem) => {
    if (subItem.url && subItem.url.startsWith("/")) {
      const [target, hash] = subItem.url.split("#");
      // "/page#section" links are cross-links to a section, not a tab.
      return hash ? false : pathname === target;
    }
    return pathname === "/" && active === subItem.slug;
  };

  // Hash tabs must go through `/` when opened from an admin route, otherwise
  // the browser only appends the hash to the current path.
  const hrefFor = (subItem: NavMainSubItem) => {
    if (subItem.url) {
      return subItem.url;
    }
    return pathname === "/" ? `#${subItem.slug}` : `/#${subItem.slug}`;
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
                      if (primary) {
                        setActive(primary.slug);
                      } else {
                        setOpen(true);
                      }
                    }}
                    render={
                      href ? (
                        <a href={href} aria-label={item.title} />
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
      {items.map((item) => {
        const hasActiveChild = Boolean(item.items?.some(isSubItemActive));

        return (
          <SidebarGroup key={item.title}>
            <CategoryLabel item={item} />
            <SidebarMenu>
              <Collapsible
                defaultOpen={Boolean(item.isActive) || hasActiveChild}
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
                              <a
                                href={href}
                                aria-current={isCurrent ? "page" : undefined}
                                onClick={() => setActive(subItem.slug)}
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
      })}
    </>
  );
}
