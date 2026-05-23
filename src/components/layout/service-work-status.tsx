"use client";

import * as React from "react";

import { getServiceStatus } from "@/lib/service-status";

export function ServiceWorkStatus({
  className
}: {
  className?: string;
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
    <div className={className}>
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
      <span className="whitespace-nowrap text-[14px] font-medium text-white/86">{status.label}</span>
      <span className="hidden whitespace-nowrap text-[13px] font-medium text-white/65 sm:inline">
        · {status.description}
      </span>
    </div>
  );
}
