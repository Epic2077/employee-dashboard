"use client";

import { useOptimistic, useTransition } from "react";
import {
  CoffeeIcon,
  CupSodaIcon,
  GlassWaterIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  formatLongPersianDate,
  formatToman,
  getPersianPartsFromIso,
  getWeekdayIndexFromIso,
} from "@/components/shared/persian-calendar";
import { setServiceQuantity } from "@/lib/services/actions";
import type { ServiceItem } from "@/lib/services/types";
import { cn } from "@/lib/utils";

function ServiceIcon({ slug }: { slug: string }) {
  const Icon =
    slug === "coffee"
      ? CoffeeIcon
      : slug === "tea"
        ? CupSodaIcon
        : slug === "water"
          ? GlassWaterIcon
          : PackageIcon;

  return <Icon className="size-4" />;
}

export function ServiceCard({
  item,
  todayIso,
}: {
  item: ServiceItem;
  todayIso: string;
}) {
  const [quantity, applyOptimistic] = useOptimistic(
    item.todayQuantity,
    (_previous: number, next: number) => next,
  );
  const [pending, startTransition] = useTransition();

  const parts = getPersianPartsFromIso(todayIso);
  const weekdayIndex = getWeekdayIndexFromIso(todayIso);
  const todayLabel = formatLongPersianDate(
    parts.year,
    parts.month,
    parts.day,
    weekdayIndex,
  );

  const commit = (next: number) => {
    if (pending) return;
    if (next < 0 || next > item.maxPerDay) return;

    startTransition(async () => {
      applyOptimistic(next);
      const result = await setServiceQuantity({
        serviceId: item.id,
        quantity: next,
      });
      if (!result.ok) {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ServiceIcon slug={item.slug} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.name}</p>
            <p className="text-[11px] text-muted-foreground">
              هر {item.unitLabel} {formatToman(item.priceIrt)}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
          سقف {item.maxPerDay} {item.unitLabel}
        </span>
      </div>

      {item.description ? (
        <p className="text-[11px] leading-5 text-muted-foreground">
          {item.description}
        </p>
      ) : null}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => commit(quantity - 1)}
          disabled={pending || quantity <= 0}
          aria-label={`کاهش ${item.name}`}
          className="flex size-9 items-center justify-center rounded-full border transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <MinusIcon className="size-4" />
        </button>

        <div className="min-w-20 text-center">
          <p className="text-3xl font-bold tabular-nums">{quantity}</p>
          <p className="text-[10px] text-muted-foreground">
            {item.unitLabel} امروز
          </p>
        </div>

        <button
          type="button"
          onClick={() => commit(quantity + 1)}
          disabled={pending || quantity >= item.maxPerDay}
          aria-label={`افزایش ${item.name}`}
          className="flex size-9 items-center justify-center rounded-full border transition hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <PlusIcon className="size-4" />
        </button>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-xs">
        <span className="text-muted-foreground">هزینه امروز</span>
        <span className="font-bold tabular-nums">
          {formatToman(quantity * item.priceIrt)}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">{todayLabel}</span>
        {quantity > 0 ? (
          <button
            type="button"
            onClick={() => commit(0)}
            disabled={pending}
            className={cn(
              "rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive transition hover:bg-destructive/20",
              pending ? "pointer-events-none opacity-60" : "",
            )}
          >
            لغو سفارش امروز
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {pending ? "در حال ذخیره…" : "تغییرات فوری ذخیره می‌شوند"}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
        <span>این ماه</span>
        <span className="tabular-nums">
          {item.monthQuantity} {item.unitLabel} · {formatToman(item.monthCost)}
        </span>
      </div>
    </div>
  );
}
