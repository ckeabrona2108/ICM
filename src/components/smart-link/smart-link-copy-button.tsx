"use client";

import * as React from "react";
import { Copy } from "lucide-react";

export function SmartLinkCopyButton({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        }).catch(() => null);
      }}
      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/72 transition hover:bg-white/[0.07] hover:text-white"
    >
      <span className="inline-flex items-center gap-1.5">
        <Copy className="h-3.5 w-3.5" />
        {copied ? "Скопировано" : "Copy Link"}
      </span>
    </button>
  );
}
