"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

export function CopyLink({
  url,
  label = "کپی لینک",
}: {
  url: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
      >
        {copied ? (
          <CheckIcon className="size-3 text-emerald-600" />
        ) : (
          <CopyIcon className="size-3" />
        )}
        {copied ? "کپی شد" : label}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
      >
        <ExternalLinkIcon className="size-3" />
        باز کردن
      </a>
    </div>
  );
}
