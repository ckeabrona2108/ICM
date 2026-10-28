"use client";

import * as React from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

// The counter number is public. Production counts by default; local dev only when the env var is set.
const COUNTER_ID = Number(
  process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || (process.env.NODE_ENV === "production" ? "113863145" : "")
);

function PageHits() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstHit = React.useRef(true);

  React.useEffect(() => {
    // The init call already counts the landing page; report only client-side navigations.
    if (isFirstHit.current) {
      isFirstHit.current = false;
      return;
    }
    const query = searchParams?.toString();
    window.ym?.(COUNTER_ID, "hit", `${window.location.origin}${pathname}${query ? `?${query}` : ""}`, {
      referer: document.referrer
    });
  }, [pathname, searchParams]);

  return null;
}

/** Yandex Metrika counter; renders nothing until NEXT_PUBLIC_YANDEX_METRIKA_ID is set. */
export function YandexMetrika() {
  if (!Number.isFinite(COUNTER_ID) || COUNTER_ID <= 0) return null;

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}", "ym");
ym(${COUNTER_ID}, "init", { ssr: true, webvisor: true, clickmap: true, ecommerce: "dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true });`}
      </Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://mc.yandex.ru/watch/${COUNTER_ID}`} style={{ position: "absolute", left: "-9999px" }} alt="" />
        </div>
      </noscript>
      <React.Suspense fallback={null}>
        <PageHits />
      </React.Suspense>
    </>
  );
}
