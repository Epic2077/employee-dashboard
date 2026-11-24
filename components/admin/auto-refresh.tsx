"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the day list fresh for the person handling lunch: soft refresh every
 * few seconds while the tab is visible.
 */
export function AutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
