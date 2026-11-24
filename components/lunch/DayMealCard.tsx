"use client";

import { useEffect, useRef } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  LOCK_REASON_LABELS,
  formatToman,
  type DayCellData,
} from "../shared/persian-calendar";

export function DayMealCard({
  days,
  activeDay,
  reservedDates,
  pricePerDayIrt,
  onSelectDay,
  onToggleReserve,
  onPrev,
  onNext,
}: {
  days: DayCellData[];
  activeDay: DayCellData | null;
  reservedDates: Set<string>;
  pricePerDayIrt: number;
  onSelectDay: (dayOfMonth: number) => void;
  onToggleReserve: (cell: DayCellData) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const chipsRef = useRef<HTMLDivElement | null>(null);

  const activeIsoDate = activeDay?.isoDate ?? null;

  useEffect(() => {
    const container = chipsRef.current;
    const chip = container?.querySelector<HTMLElement>('[data-active="true"]');
    chip?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeIsoDate]);

  if (!activeDay) return null;

  const index = days.findIndex((day) => day.isoDate === activeDay.isoDate);
  const isFirst = index <= 0;
  const isLast = index >= days.length - 1;
  const isReserved = reservedDates.has(activeDay.isoDate);
  const lockLabel = activeDay.lockReason
    ? LOCK_REASON_LABELS[activeDay.lockReason]
    : null;
  const isLocked = lockLabel !== null;

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;

    const endX = event.changedTouches[0]?.clientX ?? startX;
    const delta = endX - startX;
    if (Math.abs(delta) < 48) return;

    // RTL carousel: swipe left advances, swipe right goes back.
    if (delta < 0) {
      if (!isLast) onNext();
    } else if (!isFirst) {
      onPrev();
    }
  };

  return (
    <div
      className="rounded-xl border bg-card p-5 space-y-4 min-w-0 touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Carousel header */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={isFirst}
          aria-label="روز قبل"
          className="flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRightIcon className="size-4" />
        </button>

        <div className="min-w-0 text-center">
          <p className="text-[11px] text-muted-foreground">
            غذای روز انتخاب‌شده
          </p>
          <h2
            aria-live="polite"
            className="text-sm font-bold leading-6 truncate"
          >
            {activeDay.fullPersianDate}
          </h2>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {index + 1} از {days.length} روز کاری
          </p>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={isLast}
          aria-label="روز بعد"
          className="flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
      </div>

      {/* Meal details */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted-foreground">منوی این روز</span>
        {activeDay.meal?.tag && !isLocked ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {activeDay.meal.tag}
          </span>
        ) : null}
      </div>

      {activeDay.meal ? (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
          <div className="text-xs text-muted-foreground">غذای اصلی</div>
          <div className="text-sm font-semibold">{activeDay.meal.mainDish}</div>

          <div className="pt-2 text-xs text-muted-foreground">
            مخلفات / نوشیدنی
          </div>
          <div className="text-sm text-foreground/90">
            {activeDay.meal.sideOrDrink || "—"}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          برای این روز منویی ثبت نشده است.
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
        <span>هزینه این روز:</span>
        <span className="font-semibold text-foreground tabular-nums">
          {isLocked ? "—" : formatToman(pricePerDayIrt)}
        </span>
      </div>

      {isLocked ? (
        <div className="w-full rounded-lg border bg-muted/60 py-2.5 text-center text-xs text-muted-foreground">
          {lockLabel}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onToggleReserve(activeDay)}
          className={cn(
            "w-full rounded-lg py-2.5 px-4 text-sm font-medium transition cursor-pointer",
            isReserved
              ? "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
              : "bg-emerald-600 text-white hover:bg-emerald-500",
          )}
        >
          {isReserved ? "لغو رزرو این روز" : "رزرو ناهار این روز"}
        </button>
      )}

      {/* Day picker chips */}
      <div className="space-y-2 border-t pt-3">
        <p className="text-[11px] text-muted-foreground">
          روزهای ماه را انتخاب کنید
        </p>
        <div
          ref={chipsRef}
          className="flex items-center gap-1.5 overflow-x-auto pb-1 touch-pan-x"
        >
          {days.map((day) => {
            const isActive = day.isoDate === activeDay.isoDate;
            const isDayReserved = reservedDates.has(day.isoDate);
            const isDayLocked = day.lockReason !== null;

            return (
              <button
                key={day.id}
                type="button"
                data-active={isActive}
                onClick={() => onSelectDay(day.dayOfMonth)}
                title={
                  isDayLocked && day.lockReason
                    ? `${day.fullPersianDate} — ${LOCK_REASON_LABELS[day.lockReason]}`
                    : day.fullPersianDate
                }
                className={cn(
                  "relative flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border px-1.5 text-xs tabular-nums transition",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                  !isActive && isDayLocked
                    ? "text-muted-foreground/50 border-dashed"
                    : "",
                  !isActive && isDayReserved
                    ? "border-emerald-600 text-emerald-700"
                    : "",
                )}
              >
                {day.dayOfMonth}
                {isDayReserved ? (
                  <span
                    className={cn(
                      "absolute -top-1 -right-1 size-1.5 rounded-full",
                      isActive ? "bg-primary-foreground" : "bg-emerald-600",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
