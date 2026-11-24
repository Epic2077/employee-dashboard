import type { Metadata } from "next";
import { Suspense } from "react";

import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "ورود | پورتال کارکنان",
  description: "ورود کارکنان به سامانه خدمات و امکانات",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-1 text-center">
          <p className="text-lg font-bold text-primary">کوروش پارس</p>
          <h1 className="text-base font-semibold">پورتال خدمات کارکنان</h1>
          <p className="text-xs text-muted-foreground">
            برای ادامه، نام کاربری و رمز عبور خود را وارد کنید.
          </p>
        </div>

        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginRoute searchParams={searchParams} />
        </Suspense>

        <p className="mt-6 border-t pt-4 text-center text-[11px] leading-5 text-muted-foreground">
          حساب کاربری توسط واحد اداری ساخته می‌شود. در صورت نداشتن حساب با مدیر
          سیستم تماس بگیرید.
        </p>
      </div>
    </div>
  );
}

async function LoginRoute({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  return <LoginForm next={next} />;
}

function LoginFormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
