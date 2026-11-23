"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import type { ReleaseShare, ReleaseSharePercent } from "@/lib/release-share";

const TOOLTIP_WIDTH = 240;
const VIEWPORT_GAP = 8;

const TONES: Record<ReleaseSharePercent, string> = {
  90: "border-white/[0.18] bg-white/[0.08] text-white/80",
  95: "border-sky-400/50 bg-sky-500/20 text-sky-200",
  100: "border-amber-300/45 bg-amber-300/[0.16] text-amber-200"
};

/** Pill colour for a share, for places that show the percent without the tooltip. */
export function releaseShareTone(percent: ReleaseSharePercent): string {
  return TONES[percent];
}

/**
 * "Ваша доля 95%" with a tooltip that names the tariff. Hover shows it on a computer; a tap toggles
 * it on a phone without opening the release card the badge sits in.
 */
export function ReleaseShareBadge({
  share,
  short = false,
  align = "right",
  className
}: {
  share: ReleaseShare;
  /** "95%" instead of "Ваша доля 95%". */
  short?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ left: number; bottom: number } | null>(null);
  const ref = React.useRef<HTMLSpanElement>(null);

  // The tooltip is drawn over the whole page (a portal with fixed position) and kept inside the
  // window, so a badge at the edge of a card, next to the sidebar or the screen edge, is not cut off.
  React.useLayoutEffect(() => {
    if (!open || !ref.current) {
      setPosition(null);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const preferred = align === "right" ? rect.right - TOOLTIP_WIDTH : rect.left;
    const left = Math.min(Math.max(preferred, VIEWPORT_GAP), window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_GAP);
    setPosition({ left, bottom: window.innerHeight - rect.top + 10 });
  }, [open, align]);

  React.useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const hide = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open]);

  const toggle = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen((value) => !value);
  };

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`Ваша доля ${share.percent}%. ${share.title}`}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") toggle(event);
        if (event.key === "Escape") setOpen(false);
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className={cn(
        "relative inline-flex shrink-0 cursor-help select-none items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#7b61ff]/60",
        TONES[share.percent],
        className
      )}
    >
      {short ? `${share.percent}%` : `Ваша доля ${share.percent}%`}
      {open && position
        ? createPortal(
            <span
              role="tooltip"
              style={{ left: position.left, bottom: position.bottom, width: TOOLTIP_WIDTH }}
              className="pointer-events-none fixed z-[1000] block whitespace-normal rounded-xl border border-white/12 bg-[#1d1f2b] px-3 py-2.5 text-left text-[12px] font-medium leading-[1.45] text-white/75 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7)]"
            >
              <span className="mb-0.5 block text-[13px] font-bold text-white">{share.title}</span>
              {share.hint}
              {share.upsell ? <span className="mt-1.5 block text-[#c4b5fd]">{share.upsell}</span> : null}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
