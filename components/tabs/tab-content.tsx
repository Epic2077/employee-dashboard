// app/tab-content.tsx
"use client";

import { useEffect, useState } from "react";

import { ConfigPanel } from "../digital/ConfigPanel";
import type { DigitalTabData } from "@/lib/digital/types";
import type { LunchMonthData } from "@/lib/lunch/types";
import type { ServicesToday } from "@/lib/services/types";
import LunchMain from "../lunch/Main";
import { ServicesBoard } from "../services/ServicesBoard";

export const TABS = ["lunch", "services", "config"] as const;
export type TabId = (typeof TABS)[number];

function parseTabFromHash(hash: string, tabs: TabId[]): TabId {
  const cleaned = hash.replace(/^#/, "");
  return (tabs as readonly string[]).includes(cleaned)
    ? (cleaned as TabId)
    : tabs[0];
}

export function TabContent({
  tabs,
  lunch,
  services,
  config,
}: {
  tabs: TabId[];
  lunch: LunchMonthData | null;
  services: ServicesToday | null;
  config: DigitalTabData | null;
}) {
  const [activeTab, setActiveTab] = useState<TabId>(tabs[0]);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(parseTabFromHash(window.location.hash, tabs));
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [tabs]);

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