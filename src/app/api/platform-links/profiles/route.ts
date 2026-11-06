import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import {
  addArtistProfileByUrl,
  decideArtistProfile,
  getReleaseLinksOverview,
  suggestArtistProfiles
} from "@/lib/platform-link-discovery-service";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suggest"), profileKey: z.string().min(1).max(160) }),
  z.object({ action: z.literal("decide"), profileId: z.string().uuid(), decision: z.enum(["confirm", "reject"]) }),
  z.object({
    action: z.literal("add"),
    profileKey: z.string().min(1).max(160),
    platform: z.string().min(1).max(32),
    url: z.string().min(5).max(500)
  })
]);

/** Artist card profiles: find them on platforms, "Это я" / "Не я", or paste a profile link. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  const body = parsed.data;
  const userId = session.user.id;

  try {
    if (body.action === "suggest") {
      const limited = enforceRateLimit({ key: `platform-links-suggest:${userId}`, limit: 10, windowMs: 10 * 60_000 });
      if (limited) return limited;
      await suggestArtistProfiles(userId, body.profileKey);
    } else if (body.action === "decide") {
      const ok = await decideArtistProfile({ userId, profileId: body.profileId, decision: body.decision });
      if (!ok) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    } else {
      const result = await addArtistProfileByUrl({ userId, profileKey: body.profileKey, platform: body.platform, url: body.url });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(await getReleaseLinksOverview(userId));
  } catch (error) {
    console.error("[platform-links] profile action failed", error);
    return NextResponse.json({ error: "Не получилось. Попробуйте позже." }, { status: 500 });
  }
}
