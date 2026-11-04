import { createHmac, timingSafeEqual } from "node:crypto";

import type { OAuthProviderId } from "@/lib/oauth-login";

// "Connect Yandex" in the profile goes through the same NextAuth OAuth flow as signing in. This
// short-lived signed cookie tells the signIn callback that the provider account should join the
// cabinet that is already open instead of signing in to (or creating) another one.

export const OAUTH_LINK_COOKIE = "icm_oauth_link";
export const OAUTH_LINK_MAX_AGE_SECONDS = 10 * 60;

export interface OAuthLinkIntent {
  userId: string;
  provider: OAuthProviderId;
  expiresAt: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`oauth-link:${body}`).digest("base64url");
}

export function encodeOAuthLinkIntent(
  params: { userId: string; provider: OAuthProviderId; now?: number },
  secret: string
): string {
  const intent: OAuthLinkIntent = {
    userId: params.userId,
    provider: params.provider,
    expiresAt: (params.now ?? Date.now()) + OAUTH_LINK_MAX_AGE_SECONDS * 1000
  };
  const body = Buffer.from(JSON.stringify(intent)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function decodeOAuthLinkIntent(
  value: string | null | undefined,
  secret: string,
  now: number = Date.now()
): OAuthLinkIntent | null {
  if (!value || value.length > 1_024) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const intent = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<OAuthLinkIntent>;
    if (typeof intent.userId !== "string" || typeof intent.provider !== "string" || typeof intent.expiresAt !== "number") {
      return null;
    }
    if (intent.expiresAt < now) return null;
    return intent as OAuthLinkIntent;
  } catch {
    return null;
  }
}
