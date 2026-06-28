"use client";

import * as React from "react";

export function SmartLinkViewTracker({ slug }: { slug: string }) {
  React.useEffect(() => {
    const storageKey = `smart-link:view:${slug}`;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(storageKey) === "1") return;
    window.sessionStorage.setItem(storageKey, "1");

    void fetch(`/api/smart-links/${encodeURIComponent(slug)}/view${window.location.search}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        referrer: document.referrer || null
      })
    }).catch(() => null);
  }, [slug]);

  return null;
}
