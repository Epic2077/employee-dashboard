"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { changePassword, type ChangePasswordState } from "./actions";

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<
    ChangePasswordState,
    FormData
  >(changePassword, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          رمز عبور جدید
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="حداقل ۸ کاراکتر"
          className="text-left"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          تکرار رمز عبور جدید
        </label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          className="text-left"
        />
      </div>

      {state?.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "در حال ذخیره…" : "ذخیره رمز عبور"}
      </Button>
    </form>
  );
}
