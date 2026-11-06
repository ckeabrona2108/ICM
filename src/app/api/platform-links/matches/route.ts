import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getReleaseLinksOverview, resolveReleaseMatch } from "@/lib/platform-link-discovery-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  releaseId: z.string().uuid(),
  platform: z.string().min(1).max(32),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("confirm"), url: z.string().url().max(500) }),
    z.object({ kind: z.literal("reject"), url: z.string().url().max(500) }),
    z.object({ kind: z.literal("manual"), url: z.string().min(5).max(500) }),
    z.object({ kind: z.literal("waiting") })
  ])
});

/** The artist's answer to "Это он?": confirm, reject, paste their own link or say it is not out yet. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const result = await resolveReleaseMatch({ userId: session.user.id, ...parsed.data });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(await getReleaseLinksOverview(session.user.id));
}
