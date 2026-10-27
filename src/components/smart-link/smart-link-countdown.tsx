"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

function splitRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  };
}

/** Ticks down to the release moment and reloads the page so it switches to the platform buttons. */
export function SmartLinkCountdown({ target, theme }: { target: string; theme: "dark" | "light" }) {
  const router = useRouter();
  const targetTime = React.useMemo(() => Date.parse(target), [target]);
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= targetTime) {
        window.clearInterval(timer);
        router.refresh();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [router, targetTime]);

  // Rendered empty on the server so the first client paint never disagrees with it.
  const parts = splitRemaining(now === null ? 0 : targetTime - now);
  const cells = [
    { value: parts.days, label: "дн" },
    { value: parts.hours, label: "ч" },
    { value: parts.minutes, label: "мин" },
    { value: parts.seconds, label: "сек" }
  ];
  const isLight = theme === "light";

  return (
    <div className="grid grid-cols-4 gap-2" aria-live="off">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={`rounded-[14px] border px-2 py-2.5 text-center ${
            isLight ? "border-black/8 bg-white/80" : "border-white/10 bg-white/[0.06]"
          }`}
        >
          <div className={`text-[24px] font-semibold tabular-nums tracking-[-0.03em] ${isLight ? "text-[#121620]" : "text-white"}`}>
            {now === null ? "—" : String(cell.value).padStart(2, "0")}
          </div>
          <div className={`text-[11px] ${isLight ? "text-black/50" : "text-white/55"}`}>{cell.label}</div>
        </div>
      ))}
    </div>
  );
}
