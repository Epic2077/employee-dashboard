import { Suspense } from "react";
import { connection } from "next/server";

import { AdminForm } from "@/components/admin/admin-form";
import {
  formatLongPersianDate,
  getPersianMonthName,
  getPersianPartsFromIso,
  getTodayPersianParts,
  getWeekdayIndexFromIso,
} from "@/components/shared/persian-calendar";
import { Input } from "@/components/ui/input";
import { adminFieldClass } from "@/lib/admin/styles";
import { getMenuAdminData } from "@/lib/data/admin-menu";

import {
  deleteMenuOverride,
  saveMenuOverride,
  saveServiceSettings,
  saveWeeklyMenuItem,
} from "./actions";

const PERSIAN_MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const MAX_DAYS = 31;

export default function AdminMenuPage() {
  return (
    <Suspense fallback={<MenuSkeleton />}>
      <MenuView />
    </Suspense>
  );
}

async function MenuView() {
  await connection();

  const data = await getMenuAdminData();
  const today = getTodayPersianParts();
  const years = [today.year - 1, today.year, today.year + 1, today.year + 2];

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-lg font-bold tracking-tight">مدیریت منو</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          منوی هفتگی، استثناهای تاریخ‌محور و تنظیمات قیمت و بازه رزرو.
        </p>
      </div>

      {/* Service settings */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">تنظیمات سرویس</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          تعرفه و پنجره رزرو؛ تغییرات بلافاصله روی داشبورد کارکنان اعمال می‌شود.
        </p>

        <AdminForm
          action={saveServiceSettings}
          submitLabel="ذخیره تنظیمات"
          size="sm"
          className="flex flex-wrap items-end gap-3"
        >
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">قیمت هر وعده (تومان)</span>
            <Input
              name="price_per_day_irt"
              type="number"
              min={1}
              step={1000}
              dir="ltr"
              defaultValue={data.pricePerDayIrt}
              className="max-w-40 text-left tabular-nums"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">حداقل مهلت (روز)</span>
            <Input
              name="min_lead_days"
              type="number"
              min={0}
              max={60}
              dir="ltr"
              defaultValue={data.minLeadDays}
              className="max-w-28 text-left tabular-nums"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">حداکثر بازه (روز)</span>
            <Input
              name="max_advance_days"
              type="number"
              min={1}
              max={120}
              dir="ltr"
              defaultValue={data.maxAdvanceDays}
              className="max-w-28 text-left tabular-nums"
            />
          </label>
        </AdminForm>
      </section>

      {/* Weekly template */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">منوی هفتگی</h2>
          <p className="text-[11px] text-muted-foreground">
            الگوی تکرارشونده هر هفته. روزهای غیرفعال در تقویم قابل رزرو نیستند.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.weekly.map((row) => (
            <AdminForm
              key={row.weekday}
              action={saveWeeklyMenuItem}
              submitLabel="ذخیره"
              size="sm"
              className="space-y-2 rounded-xl border bg-card p-4"
            >
              <input type="hidden" name="weekday" value={row.weekday} />
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{row.weekdayName}</p>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    name="is_enabled"
                    defaultChecked={row.isEnabled}
                    className="size-4 accent-primary"
                  />
                  فعال
                </label>
              </div>
              <Input
                name="main_dish"
                defaultValue={row.mainDish}
                placeholder="غذای اصلی"
                required
              />
              <Input
                name="side_or_drink"
                defaultValue={row.sideOrDrink}
                placeholder="مخلفات / نوشیدنی"
              />
              <Input
                name="tag"
                defaultValue={row.tag}
                placeholder="برچسب (اختیاری)"
              />
            </AdminForm>
          ))}
        </div>
      </section>

      {/* Per-date overrides */}
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">استثناهای تاریخ</h2>
          <p className="text-[11px] text-muted-foreground">
            منوی یک تاریخ خاص یا تعطیلی سرویس؛ بر منوی هفتگی اولویت دارد.
          </p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[300px_1fr]">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-semibold">افزودن / تغییر استثنا</p>
            <AdminForm
              action={saveMenuOverride}
              submitLabel="ذخیره استثنا"
              size="sm"
              className="space-y-2"
            >
              <div className="grid grid-cols-3 gap-1.5">
                <select
                  name="year"
                  defaultValue={today.year}
                  className={adminFieldClass}
                  aria-label="سال"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <select
                  name="month"
                  defaultValue={today.month}
                  className={adminFieldClass}
                  aria-label="ماه"
                >
                  {PERSIAN_MONTHS.map((month) => (
                    <option key={month} value={month}>
                      {getPersianMonthName(today.year, month)}
                    </option>
                  ))}
                </select>
                <select
                  name="day"
                  defaultValue={today.day}
                  className={adminFieldClass}
                  aria-label="روز"
                >
                  {Array.from(
                    { length: MAX_DAYS },
                    (_, index) => index + 1,
                  ).map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <Input name="main_dish" placeholder="غذای اصلی" />
              <Input name="side_or_drink" placeholder="مخلفات / نوشیدنی" />
              <Input name="tag" placeholder="برچسب (اختیاری)" />
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  name="is_closed"
                  className="size-4 accent-primary"
                />
                تعطیلی سرویس در این روز
              </label>
            </AdminForm>
          </div>

          <div className="space-y-2">
            {data.overrides.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                استثنایی ثبت نشده است؛ همه روزها از منوی هفتگی استفاده می‌کنند.
              </p>
            ) : (
              data.overrides.map((row) => {
                const parts = getPersianPartsFromIso(row.serviceDate);
                const weekdayIndex = getWeekdayIndexFromIso(row.serviceDate);
                const label = formatLongPersianDate(
                  parts.year,
                  parts.month,
                  parts.day,
                  weekdayIndex,
                );

                return (
                  <div
                    key={row.serviceDate}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold tabular-nums">
                        {label}
                      </p>
                      {row.isClosed ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                          سرویس تعطیل
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <AdminForm
                        action={saveMenuOverride}
                        submitLabel="ذخیره"
                        size="sm"
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input
                          type="hidden"
                          name="service_date"
                          value={row.serviceDate}
                        />
                        <Input
                          name="main_dish"
                          defaultValue={row.mainDish}
                          placeholder="غذای اصلی"
                          className="max-w-44"
                        />
                        <Input
                          name="side_or_drink"
                          defaultValue={row.sideOrDrink}
                          placeholder="مخلفات"
                          className="max-w-40"
                        />
                        <Input
                          name="tag"
                          defaultValue={row.tag}
                          placeholder="برچسب"
                          className="max-w-28"
                        />
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <input
                            type="checkbox"
                            name="is_closed"
                            defaultChecked={row.isClosed}
                            className="size-4 accent-primary"
                          />
                          تعطیل
                        </label>
                      </AdminForm>

                      <AdminForm
                        action={deleteMenuOverride}
                        submitLabel="حذف"
                        size="sm"
                        variant="destructive"
                        className="flex items-center gap-2"
                      >
                        <input
                          type="hidden"
                          name="service_date"
                          value={row.serviceDate}
                        />
                      </AdminForm>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-48 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
