import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  buildVkIdAuthorizeUrl,
  createVkLinkCookiePayload,
  encodeVkLinkCookie,
  getVkIdConfig,
  getVkLinkRedirectUri,
  VK_LINK_COOKIE,
  VK_LINK_COOKIE_MAX_AGE_SECONDS
} from "@/lib/vk-id";

export const dynamic = "force-dynamic";

function getAppBaseUrl(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_DOMAIN?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const baseUrl = getAppBaseUrl(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.redirect(`${baseUrl}/login`);

  const config = getVkIdConfig();
  if (!config) return NextResponse.redirect(`${baseUrl}/dashboard?vk_error=unavailable`);

  const payload = createVkLinkCookiePayload(session.user.id);
  const response = NextResponse.redirect(
    buildVkIdAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: getVkLinkRedirectUri(baseUrl),
      state: payload.state,
      codeVerifier: payload.codeVerifier
    })
  );
  response.cookies.set(VK_LINK_COOKIE, encodeVkLinkCookie(payload), {
    httpOnly: true,
    secure: baseUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: VK_LINK_COOKIE_MAX_AGE_SECONDS
  });
  return response;
}
