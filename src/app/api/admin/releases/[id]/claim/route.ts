import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageReleasesSession, setReleaseModerationClaimByAdmin } from "@/lib/admin-release-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** "Взять в работу" (POST) and "Вернуть в очередь" (DELETE) for a release on moderation. */
async function handle(claim: boolean, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageReleasesSession({ prisma, userId: session.user.id, role: session.user.role }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) return NextResponse.json({ error: "Release id is required" }, { status: 400 });

  const result = await setReleaseModerationClaimByAdmin({
    prisma,
    adminId: session.user.id,
    adminName: session.user.name ?? session.user.email ?? null,
    releaseId,
    claim
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, releaseId, moderationClaim: result.claim }, { status: 200 });
}

export async function POST(_request: Request, context: { params: { id: string } }) {
  return handle(true, context);
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  return handle(false, context);
}
