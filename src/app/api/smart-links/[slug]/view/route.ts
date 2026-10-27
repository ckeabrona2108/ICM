import { NextResponse } from "next/server";

import { trackSmartLinkView } from "@/lib/smart-link-service";
import { readSmartLinkGeo } from "@/lib/smart-link-urls";

export async function POST(
  request: Request,
  context: { params: { slug: string } }
) {
  const slug = context.params.slug?.trim();
  if (!slug) {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 });
  }

  const payload = (await request.json().catch(() => null)) as { referrer?: string | null } | null;
  const url = new URL(request.url);
  const geo = readSmartLinkGeo(request.headers);

  await trackSmartLinkView({
    slug,
    utmSource: url.searchParams.get("utm_source"),
    referrer: payload?.referrer ?? request.headers.get("referer"),
    country: geo.country,
    city: geo.city,
    userAgent: request.headers.get("user-agent")
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
