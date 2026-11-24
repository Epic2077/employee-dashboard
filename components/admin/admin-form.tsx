"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { AdminFormState } from "@/lib/admin/types";

export function AdminForm({
  action,
  children,
  submitLabel = "ذخیره",
  variant = "default",
  size = "default",
  className,
  hideSubmit,
  submitSlot,
}: {
  action: (
    state: AdminFormState,
    formData: FormData,
  ) => Promise<AdminFormState>;
  children: React.ReactNode;
  submitLabel?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm";
  className?: string;
  hideSubmit?: boolean;
  /** Replaces the default submit button (must be a submit button). */
  submitSlot?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className={className}>
      {children}
      {hideSubmit ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {submitSlot ?? (
            <Button
              type="submit"
              variant={variant}
              size={size}
              disabled={pending}
            >
              {pending ? "در حال ذخیره…" : submitLabel}
            </Button>
          )}
          {state?.ok ? (
            <span className="text-xs text-emerald-600">{state.ok}</span>
          ) : null}
          {state?.error ? (
            <span className="text-xs text-destructive">{state.error}</span>
          ) : null}
        </div>
      )}
    </form>
  );
}
