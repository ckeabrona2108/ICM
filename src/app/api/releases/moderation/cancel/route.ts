import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type { CancelModerationRequest, CancelModerationSuccessResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCancelModeration } from "@/lib/release-policy";
import { isReleaseClaimedByModerator } from "@/lib/release-moderation-claim";
import { getReleaseLifecycleStatus, withReleaseLifecycleState } from "@/lib/release-counts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: CancelModerationRequest;
  try {
    payload = (await request.json()) as CancelModerationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.releaseId?.trim()) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  // Locked like the moderator's "Взять в работу" (it locks the row too): a cancel and a claim of the
  // same release never both pass their checks.
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "icecream"."release" WHERE id::text = ${payload.releaseId} AND "userId"::text = ${session.user.id} FOR UPDATE`;
    const release = await tx.release.findFirst({
      where: {
        id: payload.releaseId,
        userId: session.user.id
      },
      select: { id: true, status: true, confirmed: true, roles: true }
    });
    if (!release) return { kind: "not_found" as const };

    const effectiveStatus = getReleaseLifecycleStatus(release.status, release.roles) ?? "draft";
    const cancelPolicy = canCancelModeration({
      status: effectiveStatus,
      moderationStarted: effectiveStatus === "moderation" && Boolean(release.confirmed),
      claimedByModerator: isReleaseClaimedByModerator(release.status, release.roles)
    });
    if (!cancelPolicy.allowed) return { kind: "refused" as const, message: cancelPolicy.message };

    await tx.release.update({
      where: { id: release.id },
      data: {
        confirmed: false,
        roles: withReleaseLifecycleState(
          release.roles,
          "changes_required"
        ) as Prisma.InputJsonValue
      }
    });
    return { kind: "cancelled" as const, releaseId: release.id };
  });

  if (outcome.kind === "not_found") {
    return NextResponse.json({ error: "Релиз не найден" }, { status: 404 });
  }

  if (outcome.kind === "refused") {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            code: "INVALID_STATUS",
            field: "currentStatus",
            message:
              outcome.message ??
              "Отменить модерацию можно только для релиза на модерации."
          }
        ]
      },
      { status: 409 }
    );
  }

  const response: CancelModerationSuccessResponse = {
    ok: true,
    releaseId: outcome.releaseId,
    nextStatus: "changes_required",
    message: "Модерация отменена. Релиз снова открыт для редактирования."
  };

  return NextResponse.json(response, { status: 200 });
}
