import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeReferral } from "@/lib/referrals";

export const dynamic = "force-dynamic";

// Cancels a referral (e.g. an obvious self-invite); a bonus already given is taken back.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = body.reason?.trim() || "Отменено администратором";
  const ok = await revokeReferral(prisma, { id: params.id, reason });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Уже отменено или не найдено" }, { status: 409 });
}
