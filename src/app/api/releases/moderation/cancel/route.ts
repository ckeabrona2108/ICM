import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import type { CancelModerationRequest, CancelModerationSuccessResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCancelModeration } from "@/lib/release-policy";
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

  const release = await prisma.release.findFirst({
    where: {
      id: payload.releaseId,
      userId: session.user.id
    },
    select: { id: true, status: true, confirmed: true, roles: true }
  });

  if (!release) {
    return NextResponse.json({ error: "Релиз не найден" }, { status: 404 });
  }

  const effectiveStatus = getReleaseLifecycleStatus(release.status, release.roles) ?? "draft";
  const cancelPolicy = canCancelModeration({
    status: effectiveStatus,
    moderationStarted: effectiveStatus === "moderation" && Boolean(release.confirmed)
  });

  if (!cancelPolicy.allowed) {
    return NextResponse.json(
      {
        ok: false,
        errors: [
          {
            code: "INVALID_STATUS",
            field: "currentStatus",
            message:
              cancelPolicy.message ??
              "Отменить модерацию можно только для релиза на модерации."
          }
        ]
      },
      { status: 409 }
    );
  }

  await prisma.release.update({
    where: { id: release.id },
    data: {
      confirmed: false,
      roles: withReleaseLifecycleState(
        release.roles,
        "changes_required"
      ) as Prisma.InputJsonValue
    }
  });

  const response: CancelModerationSuccessResponse = {
    ok: true,
    releaseId: release.id,
    nextStatus: "changes_required",
    message: "Модерация отменена. Релиз снова открыт для редактирования."
  };

  return NextResponse.json(response, { status: 200 });
}
