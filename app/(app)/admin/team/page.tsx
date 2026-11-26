import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CoffeeIcon,
  NetworkIcon,
  UtensilsIcon,
} from "lucide-react";

import {
  formatToman,
  getTodayPersianParts,
  shiftPersianMonth,
} from "@/components/shared/persian-calendar";
import { adminFieldClass } from "@/lib/admin/styles";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { SCOPE_TAGS } from "@/lib/auth/scopes";
import { getTeamActivity } from "@/lib/data/team-activity";

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

export default function TeamActivityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<TeamActivitySkeleton />}>
      <TeamActivityView searchParams={searchParams} />
    </Suspense>
  );
}

async function TeamActivityView({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();

  const params = await searchParams;
  const today = getTodayPersianParts();
  const year = parseYear(params.y) ?? today.year;
  const month = parseMonth(params.m) ?? today.month;
  const memberId = typeof params.member === "string" ? params.member : null;

  const data = await getTeamActivity({ year, month, memberId });
  const prev = shiftPersianMonth(year, month, -1);
  const next = shiftPersianMonth(year, month, 1);

  const query = (target: { y: number; m: number; member?: string | null }) => {
    const search = new URLSearchParams();
    search.set("y", String(target.y));
    search.set("m", String(target.m));
    if (target.member) search.set("member", target.member);
    return `/admin/team?${search.toString()}`;
  };

  const totalLunchDays = data.members.reduce(
    (sum, row) => sum + row.lunchDays,
    0,
  );
  const totalLunchCost = data.members.reduce(
    (sum, row) => sum + row.lunchCost,
    0,
  );
  const totalServiceQuantity = data.members.reduce(
    (sum, row) => sum + row.serviceQuantity,
    0,
  );
  const totalServiceCost = data.members.reduce(
    (sum, row) => sum + row.serviceCost,
    0,
  );
  const totalConfigs = data.members.reduce(
    (sum, row) => sum + row.activeConfigs,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">فعالیت تیم</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            خلاصه فعالیت اعضای تیم در {data.monthTitle}
            {data.scope !== "all" ? " (فقط تیم شما)" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] text-primary">
            {SCOPE_TAGS[data.scope]}
          </span>
          <Link
            href={query({ y: prev.year, m: prev.month, member: memberId })}
            className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
          >
            <ChevronRightIcon className="size-3" />
            ماه قبل
          </Link>
          <Link
            href={query({ y: next.year, m: next.month, member: memberId })}
            className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted"
          >
            ماه بعد
            <ChevronLeftIcon className="size-3" />
          </Link>
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 text-xs">
        <input type="hidden" name="y" value={year} />
        <input type="hidden" name="m" value={month} />
        <label className="space-y-1">
          <span className="text-muted-foreground">عضو تیم</span>
          <select
            name="member"
            defaultValue={data.selectedMember ?? ""}
            className={adminFieldClass}
          >
            <option value="">همه اعضا</option>
            {data.visibleMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-8 rounded-md border px-3 hover:bg-muted"
        >
          اعمال
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<UtensilsIcon className="size-4" />}
          label="وعده‌های ناهار"
          value={String(totalLunchDays)}
          hint={formatToman(totalLunchCost)}
        />
        <Kpi
          icon={<CoffeeIcon className="size-4" />}
          label="سفارش سرویس‌ها"
          value={String(totalServiceQuantity)}
          hint={formatToman(totalServiceCost)}
        />
        <Kpi
          icon={<NetworkIcon className="size-4" />}
          label="کانفیگ فعال"
          value={String(totalConfigs)}
        />
        <Kpi
          icon={<UtensilsIcon className="size-4" />}
          label="اعضای در گزارش"
          value={String(data.members.length)}
        />
      </div>

      {!data.canLunch && !data.canServices && !data.canConfigs ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          برای دیدن ریز فعالیت‌ها، دسترسی گزارش ناهار، گزارش سرویس‌ها یا مدیریت
          کانفیگ لازم است.
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">خلاصه اعضا</h2>
        {data.members.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            عضوی در محدوده دسترسی شما پیدا نشد.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">نام</th>
                  <th className="px-4 py-2 text-start font-medium">نقش</th>
                  <th className="px-4 py-2 font-medium">ناهار</th>
                  <th className="px-4 py-2 font-medium">سرویس‌ها</th>
                  <th className="px-4 py-2 font-medium">کانفیگ</th>
                  <th className="px-4 py-2 text-start font-medium">
                    آخرین فعالیت
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.userId} className="border-t align-top">
                    <td className="px-4 py-2">
                      <p className="font-medium">{member.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {member.department ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {ROLE_LABELS[member.role]}
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums">
                      {member.lunchDays}
                      <span className="block text-[10px] text-muted-foreground">
                        {formatToman(member.lunchCost)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums">
                      {member.serviceQuantity}
                      <span className="block text-[10px] text-muted-foreground">
                        {formatToman(member.serviceCost)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums">
                      {member.activeConfigs}
                    </td>
                    <td
                      className="px-4 py-2 text-xs text-muted-foreground"
                      dir="ltr"
                    >
                      {member.lastActivity ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">رخدادها</h2>
          <span className="text-[11px] text-muted-foreground">
            {data.items.length} رخداد آخر
          </span>
        </div>

        {data.items.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            رخدادی برای این ماه ثبت نشده است.
          </p>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {data.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={
                      item.kind === "lunch"
                        ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600"
                        : item.kind === "service"
                          ? "rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                          : "rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    }
                  >
                    {item.kind === "lunch"
                      ? "ناهار"
                      : item.kind === "service"
                        ? "سرویس"
                        : "کانفیگ"}
                  </span>
                  <span className="font-medium">{item.userName}</span>
                  <span className="truncate text-muted-foreground">
                    {item.title} · {item.detail}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  {item.amount != null ? (
                    <span className="tabular-nums">
                      {formatToman(item.amount)}
                    </span>
                  ) : null}
                  <span dir="ltr">{item.date.slice(0, 10)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function TeamActivitySkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
