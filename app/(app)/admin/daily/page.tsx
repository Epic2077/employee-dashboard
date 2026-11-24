import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  CalendarDaysIcon,
  DownloadIcon,
  RefreshCwIcon,
  UtensilsIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import { AdminForm } from "@/components/admin/admin-form";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { formatToman } from "@/components/shared/persian-calendar";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { DailyEmployee } from "@/lib/data/admin-daily";
import { getDailyList } from "@/lib/data/admin-daily";
import { cn } from "@/lib/utils";

import { setDailyReservation } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DailyLunchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<DailySkeleton />}>
      <DailyView searchParams={searchParams} />
    </Suspense>
  );
}

async function DailyView({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const params = await searchParams;
  const date = typeof params.d === "string" ? params.d : null;
  const list = await getDailyList({ date });
  const exportHref = `/admin/daily/export?d=${list.isoDate}`;

  return (
    <div className="space-y-6">
      <AutoRefresh />

      <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">لیست روز ناهار</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            لیست کارکنان این روز و امکان رزرو یا لغو غذا برای هر نفر.
            {list.scope !== "all" ? " (فقط تیم شما)" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <RefreshCwIcon className="size-3.5" />
            به‌روزرسانی خودکار هر ۲۰ ثانیه
          </span>
          <a
            href={exportHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            <DownloadIcon className="size-3.5" />
            خروجی اکسل
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {list.options.map((option) => {
          const active = option.isoDate === list.isoDate;
          return (
            <Link
              key={option.isoDate}
              href={`/admin/daily?d=${option.isoDate}`}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-[11px] transition",
                active
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : option.isOpen
                    ? "hover:bg-muted"
                    : "text-muted-foreground/60 hover:bg-muted",
              )}
            >
              {option.weekdayName} {option.shortLabel}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<UsersIcon className="size-4" />}
          label="رزرو شده"
          value={`${list.reserved} از ${list.employees.length} نفر`}
          hint="تعداد افرادی که برای این روز غذا دارند"
        />
        <KpiCard
          icon={<WalletIcon className="size-4" />}
          label="جمع هزینه"
          value={formatToman(list.totalCost)}
          hint={`تعرفه هر وعده ${formatToman(list.priceIrt)}`}
        />
        <KpiCard
          icon={<UtensilsIcon className="size-4" />}
          label="غذای روز"
          value={list.dish ?? "ثبت نشده"}
          hint={list.isOpen ? "روز سرویس" : "این روز سرویس ندارد"}
        />
        <KpiCard
          icon={<CalendarDaysIcon className="size-4" />}
          label="تاریخ"
          value={list.label}
          hint={list.isOpen ? "قابل رزرو" : "تعطیل یا بسته"}
        />
      </div>

      {!list.isOpen ? (
        <div className="rounded-xl border border-dashed bg-amber-500/10 p-4 text-xs text-amber-700">
          برای این روز منو تعریف نشده یا روز تعطیل است؛ رزرو جدید امکان‌پذیر
          نیست. رزروهای موجود (اگر باشند) قابل لغو هستند.
        </div>
      ) : null}

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">لیست کارکنان</h2>
            <p className="text-[11px] text-muted-foreground">
              {list.canManage
                ? "با دکمه رزرو می‌توانید برای هر کارمند غذا ثبت کنید."
                : "برای رزرو یا لغو غذا نیاز به دسترسی «لیست روز و رزرو برای دیگران» دارید."}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start font-medium">نام</th>
                <th className="px-4 py-2 text-start font-medium">کد پرسنلی</th>
                <th className="px-4 py-2 text-start font-medium">
                  واحد سازمانی
                </th>
                <th className="px-4 py-2 text-start font-medium">نقش</th>
                <th className="px-4 py-2 text-start font-medium">وضعیت</th>
                {list.canManage ? (
                  <th className="px-4 py-2 text-start font-medium">عملیات</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {list.employees.map((employee) => (
                <tr
                  key={employee.userId}
                  className="border-t last:border-b-0 odd:bg-background even:bg-muted/20"
                >
                  <td className="px-4 py-2 font-medium">{employee.name}</td>
                  <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">
                    {employee.employeeCode ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {employee.department ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {ROLE_LABELS[employee.role]}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        employee.reservationId
                          ? "bg-emerald-600/10 text-emerald-700"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {employee.reservationId ? "رزرو شده" : "بدون رزرو"}
                    </span>
                  </td>
                  {list.canManage ? (
                    <td className="px-4 py-2">
                      <ReservationAction
                        employee={employee}
                        date={list.isoDate}
                        canReserve={list.isOpen}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReservationAction({
  employee,
  date,
  canReserve,
}: {
  employee: DailyEmployee;
  date: string;
  canReserve: boolean;
}) {
  if (employee.reservationId) {
    return (
      <AdminForm
        action={setDailyReservation}
        submitSlot={
          <ConfirmSubmit
            message={`رزرو «${employee.name}» برای این روز لغو شود؟`}
          >
            لغو رزرو
          </ConfirmSubmit>
        }
      >
        <input type="hidden" name="user_id" value={employee.userId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="action" value="cancel" />
      </AdminForm>
    );
  }

  return (
    <AdminForm
      action={setDailyReservation}
      submitSlot={
        <button
          type="submit"
          disabled={!canReserve}
          className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-50"
        >
          رزرو غذا
        </button>
      }
    >
      <input type="hidden" name="user_id" value={employee.userId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="action" value="reserve" />
    </AdminForm>
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
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 truncate text-lg font-bold">{value}</p>
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function DailySkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
