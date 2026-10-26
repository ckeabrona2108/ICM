"use client";

import * as React from "react";

import { getServiceStatus } from "@/lib/service-status";
import { cn } from "@/lib/utils";

export function ServiceWorkStatus({
  className,
  pill = false
}: {
  className?: string;
  /** Status Dot style: the whole status sits in a tinted pill. */
  pill?: boolean;
}) {
  const [status, setStatus] = React.useState(() => getServiceStatus());

  React.useEffect(() => {
    const tick = () => setStatus(getServiceStatus());
    tick();

    // Align updates to minute boundary so countdown changes exactly on time.
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let minuteInterval: ReturnType<typeof setInterval> | null = null;

    const firstTimeout = setTimeout(() => {
      tick();
      minuteInterval = setInterval(tick, 60_000);
    }, Math.max(1, msToNextMinute));

    const onVisibilityOrFocus = () => tick();
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);

    return () => {
      clearTimeout(firstTimeout);
      if (minuteInterval) clearInterval(minuteInterval);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
    };
  }, []);

  return (
    <div
      className={cn(
        className,
        pill &&
          (status.isWorking
            ? "h-8 rounded-full bg-emerald-400/[0.08] px-3"
            : "h-8 rounded-full bg-rose-400/[0.08] px-3")
      )}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {status.isWorking ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </>
        ) : (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
        )}
      </span>
      <span
        className={cn(
          "font-medium sm:whitespace-nowrap",
          pill
            ? cn("text-[13px] font-semibold", status.isWorking ? "text-emerald-200" : "text-rose-200")
            : "text-[13px] text-white/86 sm:text-[14px]"
        )}
      >
        {/*
          This text is time-dependent and can cross a minute boundary between SSR and hydration.
          Keep the server-rendered value, then let the mounted effect refresh it.
        */}
        <span suppressHydrationWarning>{status.label}</span>
      </span>
      <span
        suppressHydrationWarning
        className={cn(
          "hidden whitespace-nowrap font-medium sm:inline",
          pill ? "text-[12.5px] text-white/45" : "text-[13px] text-white/65"
        )}
      >
        · {status.description}
      </span>
    </div>
  );
}
