"use client";

import { formatToman } from "../shared/persian-calendar";

export function LunchKpiStrip({
  reservedCount,
  unreservedCount,
  totalCost,
}: {
  reservedCount: number;
  unreservedCount: number;
  totalCost: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">روزهای رزرو شده</p>
        <p className="mt-1.5 text-2xl font-bold text-emerald-600 tabular-nums">
          {reservedCount}{" "}
          <span className="text-xs font-normal text-muted-foreground">روز</span>
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">رزرو نشده (بدون جمعه)</p>
        <p className="mt-1.5 text-2xl font-bold tabular-nums">
          {unreservedCount}{" "}
          <span className="text-xs font-normal text-muted-foreground">روز</span>
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">جمع کل این ماه</p>
        <p className="mt-1.5 text-xl font-bold tabular-nums">
          {formatToman(totalCost)}
        </p>
      </div>
    </div>
  );
}
