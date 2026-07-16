import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import type { AdminReleaseDecisionResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import {
  canManageReleasesSession,
  canRejectRelease,
  withAdminReleaseChangesRequiredState
} from "@/lib/admin-release-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  releaseId: z.string().trim().min(1),
  action: z.enum(["approve", "request_changes", "reject"]),
  upc: z.string().trim().optional(),
  comment: z.string().trim().optional()
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resetNeedsChangesFlags(roles: unknown): Record<string, unknown> | null {
  const root = asRecord(roles);
  if (!root) return null;
  const next: Record<string, unknown> = { ...root };
  next.needsChanges = false;
  next.moderationStatus = "approved";
  next.rejectReason = null;
  next.rejectionReason = null;
  next.moderationComment = null;
  next.moderatorComment = null;
  next.lifecycleState = "approved";
  delete next.submittedToModeration;
  const submission = asRecord(next.submissionData);
  if (submission) {
    next.submissionData = {
      ...submission,
      needsChanges: false,
      moderationStatus: "approved",
      rejectReason: null,
      rejectionReason: null,
      moderationComment: null,
      moderatorComment: null,
      lifecycleState: "approved"
    };
    delete (next.submissionData as Record<string, unknown>).submittedToModeration;
  }
  return next;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageReleasesSession({ prisma, userId: session.user.id, role: session.user.role }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = decisionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const release = await prisma.release.findUnique({
    where: { id: parsed.data.releaseId },
    select: { id: true, status: true, roles: true, upc: true }
  });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (parsed.data.action === "approve") {
    const upc = parsed.data.upc?.trim() || null;
    if (upc && !/^\d{12,14}$/u.test(upc)) {
      return NextResponse.json({ error: "UPC должен содержать 12-14 цифр." }, { status: 400 });
    }
    if (upc) {
      const duplicate = await prisma.release.findFirst({
        where: {
          upc,
          id: { not: release.id }
        },
        select: { id: true }
      });
      if (duplicate) {
        return NextResponse.json({ error: "UPC уже используется в другом релизе." }, { status: 409 });
      }
    }

    await prisma.release.update({
      where: { id: release.id },
      data: {
        status: "approved",
        confirmed: true,
        upc: upc ?? release.upc,
        rejectReason: null,
        moderatorComment: null,
        roles: (resetNeedsChangesFlags(release.roles) ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });

    const response: AdminReleaseDecisionResponse = {
      ok: true,
      releaseId: release.id,
      status: "approved",
      message: "Релиз принят."
    };
    return NextResponse.json(response, { status: 200 });
  }

  const comment = parsed.data.comment?.trim() || null;
  if (!canRejectRelease(release.status, release.roles)) {
    return NextResponse.json(
      { error: "Отклонение доступно только для релизов на модерации." },
      { status: 409 }
    );
  }
  if (!comment) {
    return NextResponse.json({ error: "Причина отклонения обязательна." }, { status: 400 });
  }

  await prisma.release.update({
    where: { id: release.id },
    data: {
      status: "rejected",
      rejectReason: comment,
      moderatorComment: comment,
      roles: withAdminReleaseChangesRequiredState(
        release.roles,
        comment
      ) as Prisma.InputJsonValue
    }
  });

  const response: AdminReleaseDecisionResponse = {
    ok: true,
    releaseId: release.id,
    status: parsed.data.action === "reject" ? "rejected" : "changes_required",
    message:
      parsed.data.action === "reject"
        ? "Релиз отклонён."
        : "Релиз отправлен на доработку."
  };
  return NextResponse.json(response, { status: 200 });
}
