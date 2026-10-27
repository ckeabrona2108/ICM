"use client";

import * as React from "react";
import { Check, Copy, Share2 } from "lucide-react";

type ShareLink = {
  label: string;
  href: string;
  shortLabel: string;
};

const SHARE_BRAND_COLORS: Record<string, string> = {
  TG: "#229ed9",
  WA: "#25d366",
  VK: "#0077ff",
  f: "#1877f2",
  X: "#111111"
};

function ShareBrandIcon({ shortLabel }: { shortLabel: string }) {
  switch (shortLabel) {
    case "TG":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.2 4.8 3.8 11.4c-.8.3-.8 1.4.1 1.6l4.5 1.4 1.7 5.1c.2.7 1.2.8 1.6.2l2.5-3.4 4.8 3.5c.6.4 1.4.1 1.6-.6l2.6-13c.2-.9-.7-1.7-1.5-1.4Z" />
          <path d="m8.7 14.3 9.2-7.4" />
        </svg>
      );
    case "WA":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20a8 8 0 1 0-4.1-1.1L4 20l1.3-3.6A8 8 0 0 0 12 20Z" />
          <path d="M9.4 8.8c.2-.5.5-.5.8-.5h.7c.2 0 .5 0 .7.5l.5 1.2c.1.3.1.5-.1.7l-.5.6c-.2.2-.1.4 0 .6.3.5.8 1 1.3 1.3.2.1.4.2.6 0l.6-.5c.2-.2.4-.2.7-.1l1.2.5c.5.2.5.5.5.7v.7c0 .3 0 .6-.5.8-.5.2-1.7.3-3.6-.8-1.6-.9-3-2.3-3.9-3.9-1-1.9-.9-3.1-.7-3.6Z" />
        </svg>
      );
    case "VK":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="currentColor">
          <path d="M4.8 7.6c.1 5 2.6 8 7 8h.3v-2.9c1.6.2 2.7 1.2 3.2 2.9h2.3c-.6-2.3-2.1-3.6-3-4.1.9-.5 2.2-1.7 2.5-3.9H15c-.4 1.8-1.6 3-2.9 3.2V7.6h-2.1v5.6c-1.3-.3-3-1.6-3.1-5.6H4.8Z" />
        </svg>
      );
    case "X":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 5 19 19" />
          <path d="M19 5 5 19" />
        </svg>
      );
    case "f":
      return (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="currentColor">
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
    ? "border-black/10 bg-white/80 text-[#1b2230] hover:bg-white"
    : "border-white/12 bg-white/[0.08] text-white/85 backdrop-blur-md hover:bg-white/[0.14] hover:text-white";
  const panelClassName = isLightTheme
    ? "border-black/10 bg-white/95 text-[#111114] shadow-[0_24px_60px_-24px_rgba(40,48,72,0.35)]"
    : "border-white/10 bg-[#141418]/95 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]";
  const itemClassName = isLightTheme ? "hover:bg-black/[0.05]" : "hover:bg-white/[0.07]";
  const mutedClassName = isLightTheme ? "text-black/45" : "text-white/45";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${triggerClassName}`}
        aria-label="Поделиться"
        aria-expanded={open}
      >
        <Share2 className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute right-0 top-[calc(100%+8px)] z-30 w-[232px] rounded-[16px] border p-1.5 backdrop-blur-xl ${panelClassName}`}
        >
          <div className={`px-2.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] ${mutedClassName}`}>Поделиться</div>
          {links.map((item) => (
            <a
              key={item.label}
              role="menuitem"
              href={item.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className={`flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-[14px] transition ${itemClassName}`}
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white"
                style={{ backgroundColor: SHARE_BRAND_COLORS[item.shortLabel] ?? "#52525b" }}
              >
                <ShareBrandIcon shortLabel={item.shortLabel} />
              </span>
              {item.label}
            </a>
          ))}
          <div className={`my-1 h-px ${isLightTheme ? "bg-black/[0.07]" : "bg-white/[0.07]"}`} />
          <button
            type="button"
            role="menuitem"
            onClick={copyLink}
            className={`flex h-10 w-full items-center gap-3 rounded-[10px] px-2.5 text-left text-[14px] transition ${itemClassName}`}
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                copied ? "bg-emerald-500 text-white" : isLightTheme ? "bg-black/[0.07]" : "bg-white/[0.1]"
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </span>
            {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
