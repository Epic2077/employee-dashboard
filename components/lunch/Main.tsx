"use client";

import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { useIsMobile } from "@/hooks/use-mobile";
import { toggleReservation } from "@/lib/lunch/actions";
import type { LunchMonthData } from "@/lib/lunch/types";

import {
  LOCK_REASON_LABELS,
  PERSIAN_WEEKDAYS,
  formatLongPersianDate,
  formatToman,
  getPersianDaysInMonth,
  getPersianStartWeekdayIndex,
  shiftPersianMonth,
  toIsoServiceDate,
  type DayCellData,
  type LockReason,
} from "../shared/persian-calendar";
import { DayMealCard } from "./DayMealCard";
import { LunchGrid } from "./LunchGrid";
import { LunchKpiStrip } from "./LunchKPI";

type WindowRange = LunchMonthData["window"];

function resolveLockReason({
  isoDate,
  isFriday,
  hasMeal,
  isClosed,
  window,
}: {
  isoDate: string;
  isFriday: boolean;
  hasMeal: boolean;
  isClosed: boolean;
  window: WindowRange;
}): LockReason | null {
  if (isFriday) return "friday";
  if (isClosed) return "closed";
  if (!hasMeal) return "no-menu";
  if (isoDate < window.today) return "past";
  if (isoDate === window.today) return "today";
  if (isoDate < window.from) return "not-open";
  if (isoDate > window.to) return "too-far";
  return null;
}

export default function LunchDashboard({ data }: { data: LunchMonthData }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const cardRef = useRef<HTMLDivElement | null>(null);

  // `null` means "let the first bookable day win", which keeps month
  // navigation from landing on a locked day.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const [optimisticReserved, applyOptimistic] = useOptimistic(
    data.reservedDates,
    (state: string[], change: { isoDate: string; reserve: boolean }) =>
      change.reserve
        ? [...state, change.isoDate]
        : state.filter((isoDate) => isoDate !== change.isoDate),
  );

  const closedSet = useMemo(
    () => new Set(data.closedDates),
    [data.closedDates],
  );

  const reservedSet = useMemo(
    () => new Set(optimisticReserved),
    [optimisticReserved],
  );

  const { days, weeks } = useMemo(() => {
    const totalDays = getPersianDaysInMonth(data.year, data.month);
    const startWeekday = getPersianStartWeekdayIndex(data.year, data.month);

    const cells: DayCellData[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const weekdayIndex = (startWeekday + day - 1) % 7;
      const weekdayMeta = PERSIAN_WEEKDAYS[weekdayIndex];
      const isoDate = toIsoServiceDate(data.year, data.month, day);
      const meal =
        data.overrides[isoDate] ?? data.weeklyMenu[weekdayIndex] ?? null;

      cells.push({
        id: isoDate,
        isoDate,
        dayOfMonth: day,
        weekdayIndex,
        weekdayName: weekdayMeta.full,
        fullPersianDate: formatLongPersianDate(
          data.year,
          data.month,
          day,
          weekdayIndex,
        ),
        isFriday: weekdayMeta.isFriday,
        meal,
        lockReason: resolveLockReason({
          isoDate,
          isFriday: weekdayMeta.isFriday,
          hasMeal: meal !== null,
          isClosed: closedSet.has(isoDate),
          window: data.window,
        }),
      });
    }

    const padded: (DayCellData | null)[] = [
      ...Array.from({ length: startWeekday }, () => null),
      ...cells,
    ];
    while (padded.length % 7 !== 0) {
      padded.push(null);
    }

    const cols: (DayCellData | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      cols.push(padded.slice(i, i + 7));
    }

    return { days: cells, weeks: cols };
  }, [closedSet, data]);

  // Fridays are never served, so the carousel skips them.
  const carouselDays = useMemo(
    () => days.filter((day) => !day.isFriday),
    [days],
  );

  const activeDayItem =
    days.find((day) => day.dayOfMonth === selectedDay) ??
    carouselDays.find((day) => day.lockReason === null) ??
    carouselDays[0] ??
    days[0] ??
    null;

  const activeIndex = activeDayItem
    ? carouselDays.findIndex((day) => day.isoDate === activeDayItem.isoDate)
    : -1;

  const reservedCount = days.filter((day) =>
    reservedSet.has(day.isoDate),
  ).length;
  const activeDays = days.filter((day) => !day.isFriday);
  const unreservedCount = Math.max(0, activeDays.length - reservedCount);
  const totalCost = reservedCount * data.pricePerDayIrt;

  const goToIndex = (nextIndex: number) => {
    const next = carouselDays[nextIndex];
    if (next) {
      setSelectedDay(next.dayOfMonth);
    }
  };

  const handleSelectDay = (dayOfMonth: number, fromGrid = false) => {
    setSelectedDay(dayOfMonth);
    if (fromGrid && isMobile) {
      cardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  };

  const handleToggleDay = (cell: DayCellData) => {
    if (cell.lockReason) {
      toast.error(LOCK_REASON_LABELS[cell.lockReason]);
      return;
    }

    const reserve = !reservedSet.has(cell.isoDate);

    startTransition(async () => {
      applyOptimistic({ isoDate: cell.isoDate, reserve });
      const result = await toggleReservation({
        serviceDate: cell.isoDate,
        reserve,
      });
      if (!result.ok) {
        toast.error(result.message);
      }
    });
  };

  const handleShiftMonth = (delta: number) => {
    const next = shiftPersianMonth(data.year, data.month, delta);
    setSelectedDay(null);
    router.push(`/?y=${next.year}&m=${next.month}`);
  };

  return (
    <section
      dir="rtl"
      className="w-full min-w-0 space-y-6 rounded-2xl border bg-background p-5 sm:p-6 shadow-xs"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            داشبورد رزرو ناهار کارکنان — {data.monthTitle}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            رزرو از فردا تا دو هفته آینده باز است. امروز و روزهای گذشته قابل
            رزرو نیستند و جمعه‌ها تعطیل‌اند.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 self-start rounded-lg bg-muted/60 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">تعرفه هر وعده:</span>
          <span className="font-semibold tabular-nums">
            {formatToman(data.pricePerDayIrt)}
          </span>
        </div>
      </div>

      <LunchKpiStrip
        reservedCount={reservedCount}
        unreservedCount={unreservedCount}
        totalCost={totalCost}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="order-2 lg:order-none lg:col-span-7 min-w-0">
          <LunchGrid
            monthYearTitle={data.monthTitle}
            weeks={weeks}
            reservedDates={reservedSet}
            selectedDay={activeDayItem?.dayOfMonth ?? null}
            reservedCount={reservedCount}
            unreservedCount={unreservedCount}
            totalCost={totalCost}
            pricePerDayIrt={data.pricePerDayIrt}
            readOnly={isMobile}
            onPrevMonth={() => handleShiftMonth(-1)}
            onNextMonth={() => handleShiftMonth(1)}
            onSelectDay={(dayOfMonth) => handleSelectDay(dayOfMonth, true)}
            onToggleDay={handleToggleDay}
          />
        </div>

        <div
          ref={cardRef}
          className="order-1 lg:order-none lg:col-span-5 min-w-0 scroll-mt-24"
        >
          <DayMealCard
            days={carouselDays}
            activeDay={activeDayItem}
            reservedDates={reservedSet}
            pricePerDayIrt={data.pricePerDayIrt}
            onSelectDay={setSelectedDay}
            onToggleReserve={handleToggleDay}
            onPrev={() => goToIndex(activeIndex - 1)}
            onNext={() => goToIndex(activeIndex + 1)}
          />
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground lg:hidden">
        با کشیدن کارت به چپ و راست بین روزها جابه‌جا شوید؛ رزرو همان‌جا انجام
        می‌شود. مجموع: {formatToman(totalCost)}
      </p>
    </section>
  );
}
