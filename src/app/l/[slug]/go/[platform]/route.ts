import { NextResponse } from "next/server";

import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { resolveSmartLinkRedirect } from "@/lib/smart-link-service";
import { decodeSmartLinkSlug, readSmartLinkGeo } from "@/lib/smart-link-urls";

export async function GET(
  request: Request,
  context: { params: { slug: string; platform: string } }
) {
  const slug = decodeSmartLinkSlug(context.params.slug);
  const platform = context.params.platform?.trim();

  if (!slug || !platform) {
    return NextResponse.redirect(new URL("/", request.url), { status: 302 });
  }

  const url = new URL(request.url);
  const geo = readSmartLinkGeo(request.headers);
  const ip = getRequestIp(request);
  // Переход работает всегда, а слишком частые клики с одного адреса просто не считаются.
  const trackClick = consumeRateLimit({ key: `smart-link-click:${ip}`, limit: 60, windowMs: 60_000 }).allowed;
  const destination = await resolveSmartLinkRedirect({
    slug,
    platformCode: platform,
    utmSource: url.searchParams.get("utm_source"),
    referrer: request.headers.get("referer"),
    country: geo.country,
    city: geo.city,
    userAgent: request.headers.get("user-agent"),
    ip,
    trackClick
  });

  if (!destination) {
    return NextResponse.redirect(new URL(`/l/${encodeURIComponent(slug)}`, request.url), { status: 302 });
  }

  return NextResponse.redirect(destination, { status: 302 });
}
