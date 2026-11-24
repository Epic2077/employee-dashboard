import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import {
  formatToman,
  getPersianMonthYearTitle,
  getTodayPersianParts,
  shiftPersianMonth,
} from "@/components/shared/persian-calendar";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getLunchReport } from "@/lib/data/admin-report";

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

export default function AdminReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportView searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportView({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const params = await searchParams;
  const today = getTodayPersianParts();
  const year = parseYear(params.y) ?? today.year;
  const month = parseMonth(params.m) ?? today.month;
  const department = typeof params.d === "string" ? params.d : null;

  const report = await getLunchReport({ year, month, department });
  const prev = shiftPersianMonth(year, month, -1);
  const next = shiftPersianMonth(year, month, 1);
  const departmentQuery = report.department
    ? `&d=${encodeURIComponent(report.department)}`
    : "";

  const averageCost =
    report.totalReservations > 0
      ? Math.round(report.totalCost / report.totalReservations)
      : 0;
  const workingDays = report.perDay.filter((day) => !day.isFriday);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">گزارش ناهار</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            تعداد رزروها، مشارکت کارکنان و هزینه ماهانه سرویس غذا.
            {report.scope !== "all" ? " (فقط اطلاعات تیم شما)" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {report.scope === "all" && report.departments.length > 0 ? (
            <form method="get" className="flex items-center gap-1.5 text-xs">
              <input type="hidden" name="y" value={year} />
              <input type="hidden" name="m" value={month} />
              <select
                name="d"
                defaultValue={report.department ?? ""}
                className="h-8 rounded-md border bg-background px-2 text-xs"
                aria-label="واحد سازمانی"
              >
                <option value="">همه واحدها</option>
                {report.departments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-8 rounded-md border px-2 hover:bg-muted"
              >
                فیلتر
              </button>
            </form>
          ) : null}

          <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs">
            <Link
              href={`/admin?y=${prev.year}&m=${prev.month}${departmentQuery}`}
              className="rounded-md p-1 hover:bg-muted"
              aria-label="ماه قبل"
            >
              <ChevronRightIcon className="size-4" />
            </Link>
            <span className="font-semibold tabular-nums">
              {getPersianMonthYearTitle(year, month)}
            </span>
            <Link
              href={`/admin?y=${next.year}&m=${next.month}${departmentQuery}`}
              className="rounded-md p-1 hover:bg-muted"
              aria-label="ماه بعد"
            >
              <ChevronLeftIcon className="size-4" />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<CalendarDaysIcon className="size-4" />}
          label="کل رزروها"
          value={`${report.totalReservations} وعده`}
          hint={`${workingDays.length} روز کاری در ماه`}
        />
        <KpiCard
          icon={<UsersIcon className="size-4" />}
          label="کارمندان رزروکننده"
          value={`${report.distinctEmployees} نفر`}
          hint={`از ${report.activeProfiles} پروفایل فعال`}
        />
        <KpiCard
          icon={<WalletIcon className="size-4" />}
          label="جمع هزینه"
          value={formatToman(report.totalCost)}
          hint="مجموع مبلغ ثبت‌شده در رزروها"
        />
        <KpiCard
          icon={<TrendingUpIcon className="size-4" />}
          label="میانگین هر وعده"
          value={formatToman(averageCost)}
          hint="بر اساس قیمت زمان رزرو"
        />
      </div>

      {report.totalReservations === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          در این ماه هنوز رزروی ثبت نشده است.
        </div>
      ) : null}

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">تفکیک روزانه</h2>
          <p className="text-[11px] text-muted-foreground">
            تعداد و هزینه رزروها برای هر روز سرویس.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start font-medium">تاریخ</th>
                <th className="px-4 py-2 text-start font-medium">غذا</th>
                <th className="px-4 py-2 text-start font-medium">تعداد</th>
                <th className="px-4 py-2 text-start font-medium">هزینه</th>
              </tr>
            </thead>
            <tbody>
              {workingDays.map((day) => (
                <tr
                  key={day.isoDate}
                  className="border-t last:border-b-0 odd:bg-background even:bg-muted/20"
                >
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                    {day.weekdayName} {day.dayOfMonth}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {day.dish ?? "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    <span
                      className={
                        day.reservedCount > 0
                          ? "font-semibold text-emerald-600"
                          : "text-muted-foreground/60"
                      }
                    >
                      {day.reservedCount}
                    </span>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">
                    {day.cost > 0 ? formatToman(day.cost) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">جمع‌بندی کارکنان</h2>
          <p className="text-[11px] text-muted-foreground">
            تعداد روزهای رزروشده و هزینه هر کارمند در این ماه.
          </p>
        </div>

        {report.perEmployee.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            داده‌ای برای نمایش وجود ندارد.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">کارمند</th>
                  <th className="px-4 py-2 text-start font-medium">واحد</th>
                  <th className="px-4 py-2 text-start font-medium">نقش</th>
                  <th className="px-4 py-2 text-start font-medium">روزها</th>
                  <th className="px-4 py-2 text-start font-medium">هزینه</th>
                </tr>
              </thead>
              <tbody>
                {report.perEmployee.map((employee) => (
                  <tr
                    key={employee.userId}
                    className="border-t last:border-b-0 odd:bg-background even:bg-muted/20"
                  >
                    <td className="px-4 py-2 font-medium">{employee.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {employee.department ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {ROLE_LABELS[employee.role]}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{employee.days}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatToman(employee.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-xs">{label}</p>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
