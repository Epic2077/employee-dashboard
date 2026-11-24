import type { Metadata } from "next";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth/session";

import ChangePasswordForm from "./change-password-form";

export const metadata: Metadata = {
  title: "تغییر رمز عبور | پورتال کارکنان",
};

export default function ChangePasswordPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <div className="mb-6 space-y-1 text-center">
          <p className="text-lg font-bold text-primary">کوروش پارس</p>
          <h1 className="text-base font-semibold">تغییر رمز عبور</h1>
          <p className="text-xs text-muted-foreground">
            برای امنیت حساب، پیش از ادامه رمز عبور اولیه را تغییر دهید.
          </p>
        </div>

        <Suspense fallback={<FormSkeleton />}>
          <ChangePasswordGuard />
        </Suspense>
      </div>
    </div>
  );
}

async function ChangePasswordGuard() {
  await requireUser();
  return <ChangePasswordForm />;
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
