"use client";

import * as React from "react";

import { getCachedRequest } from "@/lib/client-request-cache";

export function DashboardPrefetch() {
  React.useEffect(() => {
    void getCachedRequest("subscription:overview", 60_000, async () => {
      const response = await fetch("/api/subscription", { method: "GET" });
      if (!response.ok) return null;
      return (await response.json().catch(() => null)) as unknown;
    });

    void getCachedRequest("sidebar:release-counts", 30_000, async () => {
      const response = await fetch("/api/releases/counts", { method: "GET" });
      if (!response.ok) return null;
      return (await response.json().catch(() => null)) as unknown;
    });

    void getCachedRequest("profile:current-user", 60_000, async () => {
      const response = await fetch("/api/user/profile", { method: "GET" });
      if (!response.ok) return null;
      return (await response.json().catch(() => null)) as unknown;
    });
  }, []);

  return null;
}
