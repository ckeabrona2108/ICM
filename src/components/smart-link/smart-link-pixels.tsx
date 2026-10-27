import Script from "next/script";

import type { SmartLinkPixelIds } from "@/lib/smart-link-urls";

// Ids reach this component only after strict format checks in parseSmartLinkPixelIds,
// so JSON.stringify is enough to embed them into the snippets.
export function SmartLinkPixels({ ids }: { ids: SmartLinkPixelIds }) {
  return (
    <>
      {ids.meta.length > 0 ? (
        <Script id="smart-link-meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
${ids.meta.map((id) => `fbq('init',${JSON.stringify(id)});`).join("\n")}
fbq('track','PageView');`}
        </Script>
      ) : null}

      {ids.topMailRu.length > 0 ? (
        <Script id="smart-link-vk-ads-pixel" strategy="afterInteractive">
          {`var _tmr=window._tmr||(window._tmr=[]);
${ids.topMailRu.map((id) => `_tmr.push({id:${JSON.stringify(id)},type:'pageView',start:(new Date()).getTime()});`).join("\n")}
(function(d,id){if(d.getElementById(id))return;var ts=d.createElement('script');ts.async=true;ts.id=id;ts.src='https://top-fwz1.mail.ru/js/code.js';d.head.appendChild(ts);})(document,'tmr-code');`}
        </Script>
      ) : null}

      {ids.vkRetargeting.length > 0 ? (
        <Script
          id="smart-link-vk-retargeting"
          src="https://vk.com/js/api/openapi.js?169"
          strategy="afterInteractive"
        />
      ) : null}
      {ids.vkRetargeting.length > 0 ? (
        <Script id="smart-link-vk-retargeting-init" strategy="lazyOnload">
          {`(function hit(attempt){if(window.VK&&window.VK.Retargeting){${ids.vkRetargeting
            .map((id) => `window.VK.Retargeting.Init(${JSON.stringify(id)});window.VK.Retargeting.Hit();`)
            .join("")}}else if(attempt<20){setTimeout(function(){hit(attempt+1)},250);}})(0);`}
        </Script>
      ) : null}
    </>
  );
}
