import { Suspense } from "react";
import { connection } from "next/server";

import { getTodayPersianParts } from "@/components/shared/persian-calendar";
import { TabContent } from "@/components/tabs/tab-content";
import type { TabId } from "@/components/tabs/tab-content";
import { getMyAccess } from "@/lib/auth/permissions";
import { getLunchMonth } from "@/lib/data/lunch";
import { getServicesToday } from "@/lib/data/services";
import { getMyDigitalTab } from "@/lib/data/digital";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseMonth(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^([1-9]|1[0-2])$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

function parseYear(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^1[34]\d{2}$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex w-full min-w-0 flex-1 flex-col items-center justify-center">
      <main className="w-full min-w-0 min-h-screen">
        <Suspense fallback={<LunchSkeleton />}>
          <LunchRoute searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function LunchRoute({ searchParams }: { searchParams: SearchParams }) {
  // The current Persian month and the booking window depend on "now", so this
  // subtree has to render per request instead of during prerendering.
  await connection();

  const params = await searchParams;
  const today = getTodayPersianParts();

  const year = parseYear(params.y) ?? today.year;
  const month = parseMonth(params.m) ?? today.month;

  const access = await getMyAccess();
  const canLunch = access.hasAccess("lunch.view");
  const canServices = access.hasAccess("services.view");
  const canConfig = access.hasAccess("config.view");

  const tabs: TabId[] = [];
  if (canLunch) tabs.push("lunch");
  if (canServices) tabs.push("services");
  if (canConfig) tabs.push("config");

  if (tabs.length === 0) {
    return <NoSectionAccess />;
  }

  const [lunch, services, config] = await Promise.all([
    canLunch ? getLunchMonth({ year, month }) : Promise.resolve(null),
    canServices ? getServicesToday() : Promise.resolve(null),
    canConfig ? getMyDigitalTab() : Promise.resolve(null),
  ]);

  return (
    <TabContent
      tabs={tabs}
      lunch={lunch}
      services={services}
      config={config}
    />
  );
}

function NoSectionAccess() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-dashed bg-muted/20 p-8 text-center">
      <h1 className="text-base font-semibold">بخشی برای نمایش وجود ندارد</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        دسترسی شما به بخش‌های کارکنان توسط مدیر سامانه تنظیم شده است. برای دریافت
        دسترسی با مالک سامانه تماس بگیرید.
      </p>
    </div>
  );
}

function LunchSkeleton() {
  return (
    <div className="w-full space-y-6 p-5 sm:p-6" aria-hidden="true">
      <div className="h-10 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-96 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}