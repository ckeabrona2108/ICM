import { NextResponse } from "next/server";

import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";
import { runSmartLinkAutofillInBackground, trackSmartLinkView } from "@/lib/smart-link-service";
import { decodeSmartLinkSlug, readSmartLinkGeo } from "@/lib/smart-link-urls";

export async function POST(
  request: Request,
  context: { params: { slug: string } }
) {
  const slug = decodeSmartLinkSlug(context.params.slug);
  if (!slug) {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const limited = enforceRateLimit({ key: `smart-link-view:${ip}`, limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const payload = (await request.json().catch(() => null)) as { referrer?: string | null } | null;
  const url = new URL(request.url);
  const geo = readSmartLinkGeo(request.headers);

  try {
    await trackSmartLinkView({
      slug,
      utmSource: url.searchParams.get("utm_source"),
      referrer: payload?.referrer ?? request.headers.get("referer"),
      country: geo.country,
      city: geo.city,
      userAgent: request.headers.get("user-agent"),
      ip
    });
  } catch (error) {
    console.error("[smart-link:view] tracking failed", error);
  }

  // Released links that still miss platforms get them from the UPC search; the visitor never waits for it.
  void runSmartLinkAutofillInBackground(slug).catch((error) => {
    console.error("[smart-link:autofill] background search failed", error);
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
