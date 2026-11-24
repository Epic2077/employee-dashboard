// app/tab-content.tsx
"use client";

import { useEffect, useState } from "react";

import { ConfigPanel } from "../digital/ConfigPanel";
import type { DigitalTabData } from "@/lib/digital/types";
import type { LunchMonthData } from "@/lib/lunch/types";
import type { ServicesToday } from "@/lib/services/types";
import LunchMain from "../lunch/Main";
import { ServicesBoard } from "../services/ServicesBoard";

const TABS = ["lunch", "services", "config"] as const;
type TabId = (typeof TABS)[number];
const DEFAULT_TAB: TabId = "lunch";

function parseTabFromHash(hash: string): TabId {
  const cleaned = hash.replace(/^#/, "");
  return (TABS as readonly string[]).includes(cleaned)
    ? (cleaned as TabId)
    : DEFAULT_TAB;
}

export function TabContent({
  lunch,
  services,
  config,
}: {
  lunch: LunchMonthData;
  services: ServicesToday;
  config: DigitalTabData;
}) {
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(parseTabFromHash(window.location.hash));
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <div className="py-5">
      {activeTab === "lunch" && (
        <LunchMain key={`${lunch.year}-${lunch.month}`} data={lunch} />
      )}
      {activeTab === "services" && <ServicesBoard data={services} />}
      {activeTab === "config" && <ConfigPanel data={config} />}
    </div>
  );
}
