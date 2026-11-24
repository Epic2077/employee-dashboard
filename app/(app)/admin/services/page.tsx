import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PackageIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import { AdminForm } from "@/components/admin/admin-form";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import {
  formatToman,
  getPersianMonthYearTitle,
  getTodayPersianParts,
  shiftPersianMonth,
} from "@/components/shared/persian-calendar";
import { Input } from "@/components/ui/input";
import { getMyAccess } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { ServiceSummaryRow } from "@/lib/data/admin-services";
import { getServicesReport } from "@/lib/data/admin-services";
import { cn } from "@/lib/utils";

import { deleteService, saveService } from "./actions";

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

export default function AdminServicesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<ServicesSkeleton />}>
      <ServicesView searchParams={searchParams} />
    </Suspense>
  );
}

async function ServicesView({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const access = await getMyAccess();
  const canEdit = access.scopes["services.manage"] === "all";

  const params = await searchParams;
  const today = getTodayPersianParts();
  const year = parseYear(params.y) ?? today.year;
  const month = parseMonth(params.m) ?? today.month;
  const department = typeof params.d === "string" ? params.d : null;

  const report = await getServicesReport({ year, month, department });
  const prev = shiftPersianMonth(year, month, -1);
  const next = shiftPersianMonth(year, month, 1);
  const departmentQuery = report.department
    ? `&d=${encodeURIComponent(report.department)}`
    : "";
  const activeDays = report.perDay.filter((day) => day.quantity > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">گزارش سرویس‌ها</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            تعداد سفارش و هزینه سرویس‌های رفاهی (قهوه، چای و …) در هر ماه.
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
              href={`/admin/services?y=${prev.year}&m=${prev.month}${departmentQuery}`}
              className="rounded-md p-1 hover:bg-muted"
              aria-label="ماه قبل"
            >
              <ChevronRightIcon className="size-4" />
            </Link>
            <span className="font-semibold tabular-nums">
              {getPersianMonthYearTitle(year, month)}
            </span>
            <Link
              href={`/admin/services?y=${next.year}&m=${next.month}${departmentQuery}`}
              className="rounded-md p-1 hover:bg-muted"
              aria-label="ماه بعد"
            >
              <ChevronLeftIcon className="size-4" />
            </Link>
          </div>
        </div>
      </div>

      {!report.available ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          سرویس‌های رفاهی هنوز روی دیتابیس فعال نشده‌اند. مایگریشن
          <span className="mx-1 font-mono text-[11px]" dir="ltr">
            20261124084902_services_catalog.sql
          </span>
          را اجرا کنید.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={<PackageIcon className="size-4" />}
              label="مجموع سفارش‌ها"
              value={`${report.totalQuantity} مورد`}
              hint={`${report.services.filter((service) => service.isActive).length} سرویس فعال`}
            />
            <KpiCard
              icon={<UsersIcon className="size-4" />}
              label="سفارش‌دهندگان"
              value={`${report.distinctEmployees} نفر`}
              hint="کارکنانی که این ماه سفارش داده‌اند"
            />
            <KpiCard
              icon={<WalletIcon className="size-4" />}
              label="جمع هزینه"
              value={formatToman(report.totalCost)}
              hint="مجموع مبلغ ثبت‌شده سفارش‌ها"
            />
            <KpiCard
              icon={<CalendarDaysIcon className="size-4" />}
              label="سفارش‌های امروز"
              value={`${report.todayQuantity} مورد`}
              hint="ثبت‌شده برای امروز"
            />
          </div>

          <section className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">تفکیک سرویس‌ها</h2>
              <p className="text-[11px] text-muted-foreground">
                وضعیت، قیمت و مصرف هر سرویس در این ماه.
              </p>
            </div>

            {report.services.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                هنوز سرویسی تعریف نشده است.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-start font-medium">
                        سرویس
                      </th>
                      <th className="px-4 py-2 text-start font-medium">
                        قیمت واحد
                      </th>
                      <th className="px-4 py-2 text-start font-medium">
                        سقف روزانه
                      </th>
                      <th className="px-4 py-2 text-start font-medium">
                        تعداد
                      </th>
                      <th className="px-4 py-2 text-start font-medium">
                        هزینه
                      </th>
                      <th className="px-4 py-2 text-start font-medium">
                        امروز
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.services.map((service) => (
                      <tr
                        key={service.id}
                        className="border-t last:border-b-0 odd:bg-background even:bg-muted/20"
                      >
                        <td className="px-4 py-2">
                          <span className="font-medium">{service.name}</span>
                          <span
                            className={cn(
                              "ms-2 rounded-full px-1.5 py-0.5 text-[10px]",
                              service.isActive
                                ? "bg-emerald-600/10 text-emerald-700"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {service.isActive ? "فعال" : "غیرفعال"}
                          </span>
                        </td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">
                          {formatToman(service.priceIrt)}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">
                          {service.maxPerDay} {service.unitLabel}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {service.quantity} {service.unitLabel}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">
                          {formatToman(service.cost)}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {service.todayQuantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {canEdit ? (
            <section id="manage" className="space-y-3">
              <div className="rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold">افزودن سرویس جدید</h2>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  مثلاً «چای» با واحد «لیوان» و قیمت هر لیوان. بعد از افزودن،
                  کارکنان بلافاصله آن را در تب سرویس‌های رفاهی می‌بینند.
                </p>

                <AdminForm
                  action={saveService}
                  submitLabel="افزودن سرویس"
                  size="sm"
                  className="space-y-3"
                >
                  <ServiceFields />
                </AdminForm>
              </div>

              {report.services.length === 0 ? null : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {report.services.map((service) => (
                    <div
                      key={service.id}
                      className="rounded-xl border bg-card p-4"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{service.name}</p>
                        <span className="text-[11px] text-muted-foreground">
                          شناسه: <span dir="ltr">{service.id.slice(0, 8)}</span>
                        </span>
                      </div>

                      <details className="border-t pt-2">
                        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                          ویرایش سرویس
                        </summary>

                        <AdminForm
                          key={`${service.id}-${service.name}-${service.priceIrt}-${service.maxPerDay}-${service.isActive}`}
                          action={saveService}
                          submitLabel="ذخیره تغییرات"
                          size="sm"
                          className="mt-3 space-y-3"
                        >
                          <input
                            type="hidden"
                            name="service_id"
                            value={service.id}
                          />
                          <ServiceFields service={service} />
                        </AdminForm>

                        <div className="mt-3 border-t pt-3">
                          <AdminForm
                            action={deleteService}
                            submitSlot={
                              <ConfirmSubmit
                                message={`سرویس «${service.name}» و همه سفارش‌های آن حذف شود؟`}
                              >
                                حذف سرویس
                              </ConfirmSubmit>
                            }
                          >
                            <input
                              type="hidden"
                              name="service_id"
                              value={service.id}
                            />
                          </AdminForm>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">تفکیک روزانه</h2>
              <p className="text-[11px] text-muted-foreground">
                فقط روزهایی که سفارش ثبت شده است.
              </p>
            </div>

            {activeDays.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                در این ماه سفارشی ثبت نشده است.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-start font-medium">
                        تاریخ
                      </th>
                      <th className="px-4 py-2 text-start font-medium">
                        تعداد
                      </th>
                      <th className="px-4 py-2 text-start font-medium">
                        هزینه
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDays.map((day) => (
                      <tr
                        key={day.isoDate}
                        className="border-t last:border-b-0 odd:bg-background even:bg-muted/20"
                      >
                        <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                          {day.weekdayName} {day.dayOfMonth}
                        </td>
                        <td className="px-4 py-2 font-semibold tabular-nums text-emerald-600">
                          {day.quantity}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">
                          {formatToman(day.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">جمع‌بندی کارکنان</h2>
              <p className="text-[11px] text-muted-foreground">
                تعداد و هزینه سفارش هر کارمند در این ماه.
              </p>
            </div>

            {report.perEmployee.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                داده‌ای برای نمایش وجود ندارد.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-start font-medium">
                        کارمند
                      </th>
                      <th className="px-4 py-2 text-start font-medium">واحد</th>
                      <th className="px-4 py-2 text-start font-medium">نقش</th>
                      <th className="px-4 py-2 text-start font-medium">
                        تعداد
                      </th>
                      <th className="px-4 py-2 text-start font-medium">
                        هزینه
                      </th>
                      <th className="px-4 py-2 text-start font-medium">
                        تفکیک
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.perEmployee.map((employee) => (
                      <tr
                        key={employee.userId}
                        className="border-t last:border-b-0 odd:bg-background even:bg-muted/20"
                      >
                        <td className="px-4 py-2 font-medium">
                          {employee.name}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {employee.department ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {ROLE_LABELS[employee.role]}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {employee.quantity}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">
                          {formatToman(employee.cost)}
                        </td>
                        <td className="px-4 py-2 text-[11px] text-muted-foreground">
                          {employee.byService
                            .map(
                              (row) =>
                                `${row.name} ${row.quantity} ${row.unitLabel}`,
                            )
                            .join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ServiceFields({ service }: { service?: ServiceSummaryRow }) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">نام سرویس *</span>
          <Input
            name="name"
            required
            defaultValue={service?.name ?? ""}
            placeholder="چای"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">شناسه انگلیسی *</span>
          <Input
            name="slug"
            required
            dir="ltr"
            defaultValue={service?.slug ?? ""}
            placeholder="tea"
            className="text-left"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">واحد *</span>
          <Input
            name="unit_label"
            required
            defaultValue={service?.unitLabel ?? "عدد"}
            placeholder="لیوان"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">قیمت هر واحد (تومان)</span>
          <Input
            name="price_irt"
            type="number"
            min={0}
            step={1000}
            dir="ltr"
            defaultValue={service?.priceIrt ?? 0}
            className="text-left tabular-nums"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">سقف روزانه</span>
          <Input
            name="max_per_day"
            type="number"
            min={1}
            max={20}
            dir="ltr"
            defaultValue={service?.maxPerDay ?? 3}
            className="text-left tabular-nums"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">ترتیب نمایش</span>
          <Input
            name="sort_order"
            type="number"
            dir="ltr"
            defaultValue={service?.sortOrder ?? 0}
            className="text-left tabular-nums"
          />
        </label>
      </div>

      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">توضیح کوتاه (اختیاری)</span>
        <Input
          name="description"
          defaultValue={service?.description ?? ""}
          placeholder="قهوه اسپرسو برای کارکنان"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={service ? service.isActive : true}
          className="size-4 accent-primary"
        />
        نمایش به کارکنان (فعال)
      </label>
    </>
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
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ServicesSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
