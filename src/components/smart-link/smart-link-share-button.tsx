"use client";

import * as React from "react";
import { Copy, Share2 } from "lucide-react";

type ShareLink = {
  label: string;
  href: string;
  shortLabel: string;
};

function ShareBrandIcon({ shortLabel }: { shortLabel: string }) {
  switch (shortLabel) {
    case "TG":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.2 4.8 3.8 11.4c-.8.3-.8 1.4.1 1.6l4.5 1.4 1.7 5.1c.2.7 1.2.8 1.6.2l2.5-3.4 4.8 3.5c.6.4 1.4.1 1.6-.6l2.6-13c.2-.9-.7-1.7-1.5-1.4Z" />
          <path d="m8.7 14.3 9.2-7.4" />
        </svg>
      );
    case "WA":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20a8 8 0 1 0-4.1-1.1L4 20l1.3-3.6A8 8 0 0 0 12 20Z" />
          <path d="M9.4 8.8c.2-.5.5-.5.8-.5h.7c.2 0 .5 0 .7.5l.5 1.2c.1.3.1.5-.1.7l-.5.6c-.2.2-.1.4 0 .6.3.5.8 1 1.3 1.3.2.1.4.2.6 0l.6-.5c.2-.2.4-.2.7-.1l1.2.5c.5.2.5.5.5.7v.7c0 .3 0 .6-.5.8-.5.2-1.7.3-3.6-.8-1.6-.9-3-2.3-3.9-3.9-1-1.9-.9-3.1-.7-3.6Z" />
        </svg>
      );
    case "VK":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
          <path d="M4.8 7.6c.1 5 2.6 8 7 8h.3v-2.9c1.6.2 2.7 1.2 3.2 2.9h2.3c-.6-2.3-2.1-3.6-3-4.1.9-.5 2.2-1.7 2.5-3.9H15c-.4 1.8-1.6 3-2.9 3.2V7.6h-2.1v5.6c-1.3-.3-3-1.6-3.1-5.6H4.8Z" />
        </svg>
      );
    case "X":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 5 19 19" />
          <path d="M19 5 5 19" />
        </svg>
      );
    case "f":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
          <path d="M13.3 20v-7h2.3l.3-2.7h-2.6V8.6c0-.8.2-1.3 1.3-1.3H16V4.9c-.2 0-.9-.1-1.8-.1-1.8 0-3 1.1-3 3.2v2.3H9v2.7h2.4v7h1.9Z" />
        </svg>
      );
    default:
      return <span className="text-[11px] font-semibold">{shortLabel}</span>;
  }
}

export function SmartLinkShareButton({
  links,
  publicUrl,
  theme = "dark"
}: {
  links: ShareLink[];
  publicUrl: string;
  theme?: "dark" | "light";
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const copyLink = React.useCallback(() => {
    void navigator.clipboard
      .writeText(publicUrl)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => null);
  }, [publicUrl]);

  const isLightTheme = theme === "light";
  const triggerClassName = isLightTheme
    ? "border-black/10 bg-white/[0.84] text-[#1b2230] shadow-[0_18px_44px_-28px_rgba(72,86,122,0.28)] hover:border-black/14 hover:bg-white"
    : "border-white/12 bg-white/[0.04] text-white/78 hover:bg-white/[0.08] hover:text-white";
  const panelClassName = isLightTheme
    ? "border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,252,0.98))] shadow-[0_26px_80px_-32px_rgba(66,79,116,0.28)]"
    : "border-white/12 bg-[#f7f7fb] shadow-[0_26px_80px_-32px_rgba(0,0,0,0.55)]";
  const actionClassName = isLightTheme
    ? "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition ${triggerClassName}`}
        aria-label="Поделиться"
        aria-expanded={open}
      >
        <Share2 className="h-4.5 w-4.5" />
      </button>

      {open ? (
        <div className={`absolute right-0 top-[calc(100%+10px)] z-30 min-w-[348px] rounded-2xl border p-2.5 ${panelClassName}`}>
          <div className="grid grid-cols-6 gap-2">
            {links.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border text-[11px] font-semibold transition ${actionClassName}`}
                aria-label={item.label}
                title={item.label}
              >
                <ShareBrandIcon shortLabel={item.shortLabel} />
              </a>
            ))}
            <button
              type="button"
              onClick={copyLink}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition ${actionClassName}`}
              aria-label="Copy Link"
              title={copied ? "Скопировано" : "Copy Link"}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
