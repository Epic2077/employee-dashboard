import { KeyRoundIcon, ShieldCheckIcon } from "lucide-react";

import { AdminForm } from "@/components/admin/admin-form";
import { CopyLink } from "@/components/digital/copy-link";
import { createMyConfig } from "@/lib/digital/actions";
import type { DigitalConfigView, DigitalTabData } from "@/lib/digital/types";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<DigitalConfigView["status"], string> = {
  active: "فعال",
  error: "خطا",
  revoked: "لغو شده",
};

export function ConfigPanel({ data }: { data: DigitalTabData }) {
  const quotaLabel =
    data.quota === null ? "نامحدود" : `${data.used} از ${data.quota}`;

  return (
    <section
      dir="rtl"
      className="w-full min-w-0 space-y-6 rounded-2xl border bg-background p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">کانفیگ</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            اشتراک اختصاصی شما روی سرورهای شرکت. لینک اشتراک را در اپ V2Ray خود
            وارد کنید.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-lg bg-muted/60 px-3 py-1.5 text-xs">
          <ShieldCheckIcon className="size-3.5" />
          <span className="text-muted-foreground">سهمیه شما:</span>
          <span className="font-semibold tabular-nums">{quotaLabel}</span>
        </div>
      </div>

      {!data.available ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          سرویس کانفیگ هنوز روی دیتابیس فعال نشده است. مایگریشن
          <span className="mx-1 font-mono text-[11px]" dir="ltr">
            20261124091825_digital_configs.sql
          </span>
          را اجرا کنید.
        </div>
      ) : !data.configured ? (
        <div className="rounded-xl border border-dashed bg-amber-500/10 p-4 text-xs leading-6 text-amber-700">
          پنل 3x-ui پیکربندی نشده است. مدیر سیستم باید
          <span className="mx-1 font-mono" dir="ltr">
            XUI_BASE_URL
          </span>
          ،
          <span className="mx-1 font-mono" dir="ltr">
            XUI_USERNAME
          </span>
          و
          <span className="mx-1 font-mono" dir="ltr">
            XUI_PASSWORD
          </span>
          را در فایل <span className="font-mono">.env</span> تنظیم کند.
        </div>
      ) : null}

      {data.available && data.canCreate ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-start gap-2">
            <KeyRoundIcon className="mt-0.5 size-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">ساخت کانفیگ</p>
              <p className="text-[11px] text-muted-foreground">
                نام کانفیگ به‌صورت خودکار نام شما خواهد بود و روی نودهای پیش‌فرض
                انتخاب‌شده توسط مدیر ساخته می‌شود.
              </p>
            </div>
          </div>

          <AdminForm
            action={createMyConfig}
            submitLabel="ساخت کانفیگ"
            size="sm"
          >
            <p className="text-[11px] text-muted-foreground">
              ساخت کانفیگ با نام «{data.fullName || "نام شما"}» روی نودهای
              پیش‌فرض انجام می‌شود.
            </p>
          </AdminForm>
        </div>
      ) : null}

      {data.available && data.configs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          {data.canCreate
            ? "هنوز کانفیگی ندارید؛ با دکمه بالا یکی بسازید."
            : "کانفیگی برای شما ثبت نشده است. با مدیر سیستم تماس بگیرید."}
        </div>
      ) : null}

      {data.configs.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.configs.map((config) => (
            <div
              key={config.id}
              className="min-w-0 rounded-xl border bg-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {config.label}
                  </p>
                  <p
                    className="truncate text-[11px] text-muted-foreground"
                    dir="ltr"
                  >
                    {config.email}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    config.status === "active"
                      ? "bg-emerald-600/10 text-emerald-700"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {STATUS_LABELS[config.status]}
                </span>
              </div>

              <div className="rounded-lg border bg-muted/30 p-2">
                <p
                  className="truncate font-mono text-[11px] text-muted-foreground"
                  dir="ltr"
                  title={config.subscriptionUrl}
                >
                  {config.subscriptionUrl}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {config.inboundIds.length} نود
                    {config.trafficLimitGb
                      ? ` · سقف ${config.trafficLimitGb} گیگابایت`
                      : ""}
                  </span>
                  <CopyLink
                    url={config.subscriptionUrl}
                    label="کپی لینک اشتراک"
                  />
                </div>
              </div>

              {config.errorMessage ? (
                <p className="text-[11px] text-destructive">
                  {config.errorMessage}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
