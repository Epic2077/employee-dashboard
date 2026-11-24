"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { signIn, type SignInState } from "./actions";

export default function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signIn,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          نام کاربری
        </label>
        <Input
          id="username"
          name="username"
          dir="auto"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={2}
          placeholder="نام و نام خانوادگی"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          رمز عبور
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
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
        {pending ? "در حال ورود…" : "ورود به حساب"}
      </Button>
    </form>
  );
}
