"use client";

import { LockIcon } from "lucide-react";

import {
  LOCK_REASON_LABELS,
  PERSIAN_WEEKDAYS,
  formatToman,
  type DayCellData,
} from "../shared/persian-calendar";

export function LunchGrid({
  monthYearTitle,
  weeks,
  reservedDates,
  selectedDay,
  reservedCount,
  unreservedCount,
  totalCost,
  pricePerDayIrt,
  readOnly = false,
  onPrevMonth,
  onNextMonth,
  onSelectDay,
  onToggleDay,
}: {
  monthYearTitle: string;
  weeks: (DayCellData | null)[][];
  reservedDates: Set<string>;
  selectedDay: number | null;
  reservedCount: number;
  unreservedCount: number;
  totalCost: number;
  pricePerDayIrt: number;
  readOnly?: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (day: number) => void;
  onToggleDay: (cell: DayCellData) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4 min-w-0">
      {/* Header + Dynamic Month Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevMonth}
            className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted transition cursor-pointer"
          >
            ماه قبل
          </button>
          <span className="text-sm font-semibold tabular-nums">
            {monthYearTitle}
          </span>
          <button
            type="button"
            onClick={onNextMonth}
            className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted transition cursor-pointer"
          >
            ماه بعد
          </button>
        </div>

        <div className="text-xs text-muted-foreground tabular-nums">
          رزرو شده: <strong className="text-foreground">{reservedCount}</strong>{" "}
          • بدون رزرو:{" "}
          <strong className="text-foreground">{unreservedCount}</strong>
        </div>
      </div>

      {readOnly ? (
        <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
          <LockIcon className="size-3.5 shrink-0" />
          در موبایل تقویم فقط‌خواندنی است. برای رزرو از کارت روز بالا استفاده
          کنید؛ با لمس هر روز، همان روز در کارت باز می‌شود.
        </p>
      ) : null}

      {/* GitHub-Style Matrix: Rows = شنبه..جمعه, Columns = هفته‌ها */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex items-start gap-2.5 min-w-max">
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {PERSIAN_WEEKDAYS.map((w) => (
              <div
                key={w.full}
                className={`flex h-7 w-12 items-center justify-start ${
                  w.isFriday ? "opacity-40" : ""
                }`}
              >
                {w.full}
              </div>
            ))}
          </div>

          <div className="flex gap-1.5 p-1">
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="flex flex-col gap-1.5">
                {PERSIAN_WEEKDAYS.map((w, rowIdx) => {
                  const cell = week[rowIdx];
                  if (!cell) {
                    return (
                      <div key={`${weekIdx}-${rowIdx}`} className="h-7 w-7" />
                    );
                  }

                  const isReserved = reservedDates.has(cell.isoDate);
                  const isSelected = selectedDay === cell.dayOfMonth;
                  const isLocked = cell.lockReason !== null;
                  const lockLabel = cell.lockReason
                    ? LOCK_REASON_LABELS[cell.lockReason]
                    : null;

                  return (
                    <button
                      key={cell.id}
                      type="button"
                      disabled={isLocked}
                      onClick={() => {
                        onSelectDay(cell.dayOfMonth);
                        if (!readOnly) {
                          onToggleDay(cell);
                        }
                      }}
                      onMouseEnter={() => onSelectDay(cell.dayOfMonth)}
                      title={
                        isLocked
                          ? `${cell.fullPersianDate} — ${lockLabel}`
                          : `${cell.fullPersianDate} — ${
                              cell.meal?.mainDish ?? ""
                            } (${isReserved ? "رزرو شده" : "رزرو نشده"})`
                      }
                      aria-pressed={isReserved}
                      className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium tabular-nums transition ${
                        isLocked
                          ? "cursor-not-allowed border border-dashed border-muted-foreground/25 bg-muted/40 text-muted-foreground/40"
                          : isReserved
                            ? "border border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-500"
                            : readOnly
                              ? "border border-border bg-transparent text-foreground"
                              : "cursor-pointer border border-border bg-transparent text-foreground hover:border-foreground/40"
                      } ${isSelected ? "ring-2 ring-primary ring-offset-1" : ""}`}
                    >
                      {cell.dayOfMonth}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-md border border-emerald-700 bg-emerald-600" />
          رزرو شده ({formatToman(pricePerDayIrt)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-md border border-border bg-transparent" />
          رزرو نشده
        </span>
        <span className="flex items-center gap-1.5 opacity-60">
          <span className="h-3.5 w-3.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted/50" />
          غیرفعال (گذشته، امروز، بیش از دو هفته، جمعه)
        </span>
      </div>

      {/* Total Under the Grid */}
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3 border">
        <span className="text-sm font-medium text-muted-foreground">
          مجموع هزینه این ماه
        </span>
        <span className="text-base font-bold tabular-nums">
          {formatToman(totalCost)}
        </span>
      </div>
    </div>
  );
}
