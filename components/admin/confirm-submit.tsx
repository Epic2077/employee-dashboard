"use client";

import { Button } from "@/components/ui/button";

/** Submit button that asks for confirmation before letting the form submit. */
export function ConfirmSubmit({
  children,
  message,
  variant = "destructive",
}: {
  children: React.ReactNode;
  message: string;
  variant?: "destructive" | "default" | "outline";
}) {
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </Button>
  );
}
