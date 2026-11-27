// app/tab-content.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ConfigPanel } from "../digital/ConfigPanel";
import type { DigitalTabData } from "@/lib/digital/types";
import type { LunchMonthData } from "@/lib/lunch/types";
import type { ServicesToday } from "@/lib/services/types";
import LunchMain from "../lunch/Main";
import { ServicesBoard } from "../services/ServicesBoard";

export const TABS = ["lunch", "services", "config"] as const;
export type TabId = (typeof TABS)[number];

function isTabId(value: string): value is TabId {
  return (TABS as readonly string[]).includes(value);
}

export function TabContent({
  initialTab,
  lunch,
  services,
  config,
}: {
  initialTab: TabId;
  lunch: LunchMonthData | null;
  services: ServicesToday | null;
  config: DigitalTabData | null;
}) {
  const router = useRouter();
  // The tab is fully controlled by the `?tab=` search param: the server
  // renders it on every request, so a refresh keeps the same tab.
  const activeTab = initialTab;

  // One-time migration for old `#tab` links: move the hash into `?tab=` so
  // the URL (and any refresh) keeps showing the same tab.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("tab")) {
      return;
    }
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash || !isTabId(hash)) {
      return;
    }
    params.set("tab", hash);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [router]);

  return (
    <div className="py-5">
      {activeTab === "lunch" && lunch && (
        <LunchMain key={`${lunch.year}-${lunch.month}`} data={lunch} />
      )}
      {activeTab === "services" && services && (
        <ServicesBoard data={services} />
      )}
      {activeTab === "config" && config && <ConfigPanel data={config} />}
    </div>
  );
}
