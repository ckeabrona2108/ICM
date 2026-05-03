import { Prisma, ReleaseStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import type {
  AdminReleaseDecisionRequest,
  AdminReleaseDecisionResponse
} from "@/lib/api/contracts";
import { prisma } from "@/lib/prisma";
import { canManageReleases } from "@/lib/admin-release-service";

const remarkSchema = z.object({
  field: z.string().trim().min(1),
  message: z.string().trim().min(1),
  section: z.string().trim().optional()
});

const decisionSchema = z.object({
  releaseId: z.string().trim().min(1),
  action: z.enum(["approve", "request_changes", "reject"]),
  upc: z.string().trim().optional(),
  comment: z.string().trim().optional(),
  remarks: z.array(remarkSchema).optional()
});

const upcPattern = /^\d{12,14}$/u;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageReleases(session.user.role)) {
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
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const body: AdminReleaseDecisionRequest = parsed.data;

  const release = await prisma.release.findUnique({
    where: { id: body.releaseId },
    select: { id: true }
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (body.action === "approve") {
    if (!body.upc || !upcPattern.test(body.upc)) {
      return NextResponse.json(
        {
          error:
            "Для принятия релиза укажите корректный UPC (12-14 цифр)."
        },
        { status: 422 }
      );
    }
  }

  if (body.action === "request_changes" || body.action === "reject") {
    const normalizedRemarks = (body.remarks ?? []).filter(
      (remark) => remark.field.trim() && remark.message.trim()
    );

    if (normalizedRemarks.length === 0 && !body.comment?.trim()) {
      return NextResponse.json(
        {
          error:
            body.action === "reject"
              ? "Для отклонения добавьте замечание по полю/разделу или комментарий."
              : "Для отправки на корректировку добавьте минимум одно замечание по полю или разделу."
        },
        { status: 422 }
      );
    }
  }

  const decisionAction =
    body.action === "approve"
      ? "RELEASE_APPROVED"
      : body.action === "reject"
        ? "RELEASE_REJECTED"
        : "RELEASE_CHANGES_REQUIRED";

  const adminPayload: Prisma.InputJsonValue =
    body.action === "approve"
      ? { upc: body.upc ?? null }
      : {
          comment: body.comment ?? null,
          remarks: (body.remarks ?? []).map((remark) => ({
            field: remark.field,
            message: remark.message,
            section: remark.section ?? null
          }))
        };

  await prisma.$transaction([
    prisma.adminLog.create({
      data: {
        adminId: session.user.id,
        action: decisionAction,
        targetType: "Release",
        targetId: body.releaseId,
        payload: adminPayload
      }
    }),
    prisma.release.update({
      where: { id: body.releaseId },
      data:
        body.action === "approve"
          ? {
              status: ReleaseStatus.APPROVED,
              upc: body.upc ?? null,
              moderationComment: null,
              moderationRemarks: Prisma.DbNull,
              moderationReturnedAt: null,
              moderationStartedAt: new Date()
            }
          : body.action === "reject"
            ? {
                status: ReleaseStatus.REJECTED,
                moderationComment:
                  body.comment?.trim() || "Релиз отклонен модерацией.",
                moderationRemarks: (body.remarks ?? []) as unknown as Prisma.InputJsonValue,
                moderationReturnedAt: new Date(),
                moderationStartedAt: new Date()
              }
          : {
              status: ReleaseStatus.CHANGES_REQUIRED,
              moderationComment: body.comment?.trim() || "Требуются правки по релизу.",
              moderationRemarks: (body.remarks ?? []) as unknown as Prisma.InputJsonValue,
              moderationReturnedAt: new Date(),
              moderationStartedAt: new Date()
            }
    })
  ]);

  const response: AdminReleaseDecisionResponse = {
    ok: true,
    releaseId: body.releaseId,
    status:
      body.action === "approve"
        ? "approved"
        : body.action === "reject"
          ? "rejected"
          : "changes_required",
    message:
      body.action === "approve"
        ? "Релиз принят модератором."
        : body.action === "reject"
          ? "Релиз отклонен модератором."
          : "Релиз отправлен на корректировку.",
    remarks: body.remarks ?? []
  };

  return NextResponse.json(response, { status: 200 });
}
