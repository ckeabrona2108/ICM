"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

function detectIos() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;
  return /iPhone|iPad|iPod/i.test(ua) || ((platform === "MacIntel" || platform === "Macintosh") && maxTouchPoints > 1);
}

function detectSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/i.test(ua);
}

function detectStandalone() {
  if (typeof window === "undefined") return false;
  const navStandalone =
    "standalone" in window.navigator &&
    typeof (window.navigator as Navigator & { standalone?: boolean }).standalone === "boolean" &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  return navStandalone || mediaStandalone;
}

export function PwaDebugChip() {
  const searchParams = useSearchParams();
  const enabled = searchParams.get("pwaDebug") === "1";
  const [state, setState] = React.useState({
    ios: false,
    safari: false,
    standalone: false
  });

  React.useEffect(() => {
    if (!enabled) return;

    const sync = () => {
      setState({
        ios: detectIos(),
        safari: detectSafari(),
        standalone: detectStandalone()
      });
    };

    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("visibilitychange", sync);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="fixed left-3 top-3 z-[120] rounded-2xl border border-white/10 bg-black/75 px-3 py-2 text-[12px] text-white/85 shadow-lg backdrop-blur-xl">
      <div>PWA debug</div>
      <div>iOS: {state.ios ? "yes" : "no"}</div>
      <div>Safari: {state.safari ? "yes" : "no"}</div>
      <div>Standalone: {state.standalone ? "yes" : "no"}</div>
    </div>
  );
}
