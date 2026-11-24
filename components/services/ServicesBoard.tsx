import { formatToman } from "@/components/shared/persian-calendar";
import { ServiceCard } from "@/components/services/ServiceCard";
import type { ServicesToday } from "@/lib/services/types";

export function ServicesBoard({ data }: { data: ServicesToday }) {
  return (
    <section
      dir="rtl"
      className="w-full min-w-0 space-y-6 rounded-2xl border bg-background p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">سرویس‌های رفاهی</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            امکاناتی که شرکت برای کارکنان فراهم می‌کند؛ قهوه، چای و سرویس‌های
            بعدی. سفارش فقط برای امروز ثبت می‌شود.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-lg bg-muted/60 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">هزینه این ماه:</span>
          <span className="font-semibold tabular-nums">
            {formatToman(data.monthCost)}
          </span>
        </div>
      </div>

      {!data.available ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          سرویس‌های رفاهی هنوز فعال نشده‌اند. لطفاً بعداً دوباره سر بزنید.
        </div>
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          در حال حاضر سرویسی برای سفارش تعریف نشده است.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((item) => (
              <ServiceCard key={item.id} item={item} todayIso={data.todayIso} />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-xs">
            <span className="text-muted-foreground">
              جمع سفارش‌های شما در این ماه
            </span>
            <span className="font-semibold tabular-nums">
              {data.monthQuantity} مورد · {formatToman(data.monthCost)}
            </span>
          </div>

          <p className="text-[11px] leading-5 text-muted-foreground">
            سرویس‌ها روزانه هستند و مانند ناهار از قبل رزرو نمی‌شوند. با کاهش
            تعداد، هزینه همان لحظه اصلاح می‌شود.
          </p>
        </>
      )}
    </section>
  );
}
