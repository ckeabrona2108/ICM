import { ReleaseStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import type {
  CancelModerationFailureResponse,
  CancelModerationRequest,
  CancelModerationSuccessResponse
} from "@/lib/api/contracts";
import { prisma } from "@/lib/prisma";
import { canCancelModeration } from "@/lib/release-policy";

const cancelModerationSchema = z.object({
  releaseId: z.string().trim().min(1)
});

function toLifecycleStatus(status: ReleaseStatus) {
  if (status === ReleaseStatus.MODERATION) return "moderation" as const;
  if (status === ReleaseStatus.CHANGES_REQUIRED) return "changes_required" as const;
  if (status === ReleaseStatus.REJECTED) return "rejected" as const;
  if (status === ReleaseStatus.APPROVED) return "approved" as const;
  if (status === ReleaseStatus.DISTRIBUTED) return "distributed" as const;
  if (status === ReleaseStatus.ARCHIVED) return "archived" as const;
  return "draft" as const;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = cancelModerationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const body = parsed.data as Pick<CancelModerationRequest, "releaseId">;

  const release = await prisma.release.findFirst({
    where: {
      id: body.releaseId,
      userId: session.user.id
    },
    select: {
      id: true,
      status: true,
      moderationStartedAt: true
    }
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const permission = canCancelModeration({
    status: toLifecycleStatus(release.status),
    moderationStarted: Boolean(release.moderationStartedAt)
  });

  if (!permission.allowed || release.status !== ReleaseStatus.MODERATION) {
    const response: CancelModerationFailureResponse = {
      ok: false,
      errors: [
        {
          code: "forbidden",
          field: "status",
          message:
            permission.message ??
            "Отмена заявки на модерацию сейчас недоступна."
        }
      ]
    };
    return NextResponse.json(response, { status: 409 });
  }

  await prisma.release.update({
    where: { id: release.id },
    data: {
      status: ReleaseStatus.CHANGES_REQUIRED,
      moderationCancelledAt: new Date(),
      moderationComment:
        "Заявка на модерацию отозвана пользователем до начала проверки.",
      moderationReturnedAt: new Date()
    }
  });

  const response: CancelModerationSuccessResponse = {
    ok: true,
    releaseId: body.releaseId,
    nextStatus: "changes_required",
    message: "Заявка на модерацию отменена. Релиз переведен в «Требуются изменения»."
  };

  return NextResponse.json(response, { status: 200 });
}
