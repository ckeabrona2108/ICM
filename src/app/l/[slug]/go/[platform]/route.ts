import { NextResponse } from "next/server";

import { resolveSmartLinkRedirect } from "@/lib/smart-link-service";

export async function GET(
  request: Request,
  context: { params: { slug: string; platform: string } }
) {
  const slug = context.params.slug?.trim();
  const platform = context.params.platform?.trim();

  if (!slug || !platform) {
    return NextResponse.redirect(new URL("/", request.url), { status: 302 });
  }

  const url = new URL(request.url);
  const destination = await resolveSmartLinkRedirect({
    slug,
    platformCode: platform,
    utmSource: url.searchParams.get("utm_source"),
    referrer: request.headers.get("referer"),
    country: request.headers.get("x-vercel-ip-country"),
    city: request.headers.get("x-vercel-ip-city"),
    userAgent: request.headers.get("user-agent")
  });

  if (!destination) {
    return NextResponse.redirect(new URL(`/l/${encodeURIComponent(slug)}`, request.url), { status: 302 });
  }

  return NextResponse.redirect(destination, { status: 302 });
}
