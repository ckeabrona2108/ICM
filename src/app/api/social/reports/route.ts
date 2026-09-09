import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  createSocialReport,
  SocialSafetySelfActionError,
  SocialSafetyTargetNotFoundError,
  socialReportInputSchema,
  type SocialSafetyPrisma
} from "@/lib/social-safety-policy";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit({ key: `social-report:${userId}`, limit: 20, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const parsed = socialReportInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid report" }, { status: 400 });
  }
  try {
    const report = await createSocialReport(prisma as unknown as SocialSafetyPrisma, userId, parsed.data);
    return NextResponse.json({ ok: true, report }, { status: 201 });
  } catch (error) {
    if (error instanceof SocialSafetyTargetNotFoundError) {
      return NextResponse.json({ error: "Target not found" }, { status: 404 });
    }
    if (error instanceof SocialSafetySelfActionError) {
      return NextResponse.json({ error: "You cannot report your own content" }, { status: 409 });
    }
    throw error;
  }
}
