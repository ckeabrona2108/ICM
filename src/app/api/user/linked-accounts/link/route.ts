import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { encodeOAuthLinkIntent, OAUTH_LINK_COOKIE, OAUTH_LINK_MAX_AGE_SECONDS } from "@/lib/oauth-link-intent";

// Starts "Connect Yandex" from the profile: the browser then runs the usual NextAuth sign-in,
// and the signIn callback attaches the Yandex account to this cabinet (see auth.ts).
// VK has its own link flow (/api/vk/link/start) and Telegram posts the widget data directly.
export const dynamic = "force-dynamic";

const bodySchema = z.object({ provider: z.literal("yandex") });

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неизвестный сервис." }, { status: 400 });

  const secret = authOptions.secret;
  if (!secret) return NextResponse.json({ error: "Привязка временно недоступна." }, { status: 503 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(OAUTH_LINK_COOKIE, encodeOAuthLinkIntent({ userId, provider: parsed.data.provider }, secret), {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:" || process.env.NEXTAUTH_URL?.startsWith("https://") === true,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_LINK_MAX_AGE_SECONDS
  });
  return response;
}
