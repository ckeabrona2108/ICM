"use client";

import * as React from "react";

import { getCachedRequest } from "@/lib/client-request-cache";

/**
 * Lyrics, karaoke and video cost nothing extra on an active PRO / ENTERPRISE subscription.
 * `null` until the subscription is known (or when it could not be read).
 */
export function useExtrasIncludedInPlan(): boolean | null {
  const [included, setIncluded] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void getCachedRequest("subscription:overview", 60_000, async () => {
      const response = await fetch("/api/subscription", { method: "GET" });
      return response.ok ? await response.json().catch(() => null) : null;
    })
      .then((payload) => {
        const quota = (payload as { release_quota?: { plan?: string; isActive?: boolean } } | null)?.release_quota;
        if (cancelled || !quota?.plan) return;
        setIncluded(Boolean(quota.isActive) && quota.plan !== "STANDARD");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return included;
}
