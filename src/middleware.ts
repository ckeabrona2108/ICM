import { NextResponse, type NextRequest } from "next/server";

const BARE_HOST = "icecreammusic.net";
const CANONICAL_HOST = "www.icecreammusic.net";

/**
 * Sign-in cookies live on one host, so pages opened on the bare domain move to www, where the
 * session, VK linking and payments run. The home page stays reachable on the bare domain because
 * lava.top checks the domain there and does not follow redirects. API routes are never redirected:
 * webhooks may be configured on either host and a redirect would drop their POST bodies.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (host !== BARE_HOST) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/" || pathname.startsWith("/api/")) return NextResponse.next();
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

  return NextResponse.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, 308);
}

export const config = {
  // Skip Next.js assets and files with an extension (images, robots.txt, sitemap.xml, etc.).
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"]
};
