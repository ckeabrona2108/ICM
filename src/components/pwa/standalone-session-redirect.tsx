"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;

  const standaloneByNavigator =
    "standalone" in window.navigator &&
    typeof (window.navigator as Navigator & { standalone?: boolean }).standalone === "boolean" &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  const standaloneByMedia = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  return standaloneByNavigator || standaloneByMedia;
}

export function StandaloneSessionRedirect({
  href
}: {
  href: string | null;
}) {
  const router = useRouter();

  React.useEffect(() => {
    if (!href) return;
    if (!isStandaloneMode()) return;
    router.replace(href);
  }, [href, router]);

  return null;
}
