"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import type { CabinetNotice, CabinetNoticeTone } from "@/lib/cabinet-notice";

const DISMISS_KEY = "icm-cabinet-notice-dismissed";

const TONES: Record<CabinetNoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  warning: {
    box: "border-amber-300/25 bg-[linear-gradient(110deg,rgba(251,191,36,0.12),rgba(19,21,29,0.6)_60%)]",
    icon: "text-amber-300",
    Icon: AlertTriangle
  },
  info: {
    box: "border-[#a78bfa]/25 bg-[linear-gradient(110deg,rgba(139,92,246,0.14),rgba(19,21,29,0.6)_60%)]",
    icon: "text-[#c4b5fd]",
    Icon: Info
  },
  success: {
    box: "border-emerald-300/25 bg-[linear-gradient(110deg,rgba(16,185,129,0.12),rgba(19,21,29,0.6)_60%)]",
    icon: "text-emerald-300",
    Icon: CheckCircle2
  }
};

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function CabinetNoticeBanner({
  notice,
  preview = false
}: {
  notice: CabinetNotice;
  /** Admin preview: always shown, the close button does nothing. */
  preview?: boolean;
}) {
  // Hidden until mounted, so a closed notice does not flash on load.
  const [hidden, setHidden] = React.useState(!preview);

  React.useEffect(() => {
    if (preview) return;
    setHidden(readDismissed() === notice.version);
  }, [notice.version, preview]);

  if (hidden) return null;

  const tone = TONES[notice.tone] ?? TONES.warning;
  const Icon = tone.Icon;

  return (
    <div role="status" className={`relative flex gap-3 rounded-[22px] border px-5 py-4 pr-12 ${tone.box}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`} />
      <div className="min-w-0">
        {notice.title ? <p className="text-[15px] font-semibold text-white">{notice.title}</p> : null}
        {notice.message ? (
          <p className={`whitespace-pre-line text-[14px] leading-relaxed text-white/70 ${notice.title ? "mt-1" : ""}`}>
            {notice.message}
          </p>
        ) : null}
        {notice.linkHref && notice.linkLabel ? (
          <Link
            href={notice.linkHref}
            className={`mt-2 inline-flex text-[13.5px] font-semibold ${tone.icon} hover:underline`}
          >
            {notice.linkLabel} →
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Закрыть уведомление"
        onClick={() => {
          if (preview) return;
          try {
            window.localStorage.setItem(DISMISS_KEY, notice.version);
          } catch {
            // Closing still works for this visit.
          }
          setHidden(true);
        }}
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
