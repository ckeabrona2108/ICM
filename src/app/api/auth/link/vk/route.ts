import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import {
  checkVkGroupMembership,
  decodeVkLinkCookie,
  exchangeVkIdCode,
  getVkIdConfig,
  getVkLinkRedirectUri,
  resolveVkLinkReturnPath,
  VK_LINK_COOKIE,
  VK_LINK_RETURN_COOKIE
} from "@/lib/vk-id";

// VK ID redirects here after the artist confirms the link. The path is fixed in the
// VK ID app settings as a trusted redirect URL; it sits beside NextAuth's catch-all.

export const dynamic = "force-dynamic";

function getAppBaseUrl(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_DOMAIN?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  return new URL(request.url).origin;
}

function finish(baseUrl: string, query: string) {
  const path = resolveVkLinkReturnPath(cookies().get(VK_LINK_RETURN_COOKIE)?.value);
  const anchor = path === "/dashboard/profile" ? "#linked-accounts" : "";
  const response = NextResponse.redirect(`${baseUrl}${path}?${query}${anchor}`);
  response.cookies.delete(VK_LINK_COOKIE);
  response.cookies.delete(VK_LINK_RETURN_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const baseUrl = getAppBaseUrl(request);
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.redirect(`${baseUrl}/login`);

  const url = new URL(request.url);
  const stored = decodeVkLinkCookie(cookies().get(VK_LINK_COOKIE)?.value);
  const config = getVkIdConfig();
  if (!config) return finish(baseUrl, "vk_error=unavailable");
  if (url.searchParams.get("error")) return finish(baseUrl, "vk_error=cancelled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const deviceId = url.searchParams.get("device_id");
  if (!stored || !code || !state || !deviceId || state !== stored.state || stored.userId !== session.user.id) {
    return finish(baseUrl, "vk_error=expired");
  }

  let vkUserId: string;
  try {
    ({ vkUserId } = await exchangeVkIdCode({
      clientId: config.clientId,
      code,
      codeVerifier: stored.codeVerifier,
      deviceId,
      redirectUri: getVkLinkRedirectUri(baseUrl),
      state
    }));
  } catch (error) {
    console.error("[vk-link] code exchange failed", error);
    return finish(baseUrl, "vk_error=failed");
  }

  let isMember = false;
  let memberCheckedAt: Date | null = null;
  try {
    isMember = await checkVkGroupMembership({ config, vkUserId });
    memberCheckedAt = new Date();
  } catch (error) {
    // The link still counts; the artist can re-check the subscription from the cabinet.
    console.error("[vk-link] membership check failed", error);
  }

  try {
    const owner = await prisma.vk_links.findUnique({ where: { vk_user_id: vkUserId }, select: { user_id: true } });
    if (owner && owner.user_id !== session.user.id) return finish(baseUrl, "vk_error=taken");

    await prisma.vk_links.upsert({
      where: { user_id: session.user.id },
      create: {
        user_id: session.user.id,
        vk_user_id: vkUserId,
        is_group_member: isMember,
        member_checked_at: memberCheckedAt
      },
      update: {
        vk_user_id: vkUserId,
        is_group_member: isMember,
        member_checked_at: memberCheckedAt,
        linked_at: new Date()
      }
    });
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "P2002") {
      return finish(baseUrl, "vk_error=taken");
    }
    if (isAnyPrismaTableMissingError(error, ["vk_links", "icecream.vk_links"])) {
      return finish(baseUrl, "vk_error=unavailable");
    }
    throw error;
  }

  return finish(baseUrl, isMember ? "vk=linked" : "vk=linked_not_member");
}
