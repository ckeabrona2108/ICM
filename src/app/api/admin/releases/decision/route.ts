import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { AdminReleaseDecisionResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import {
  approveReleaseByAdmin,
  canManageReleasesSession,
  rejectReleaseByAdmin
} from "@/lib/admin-release-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  releaseId: z.string().trim().min(1),
  action: z.enum(["approve", "request_changes", "reject"]),
  upc: z.string().trim().optional(),
  comment: z.string().trim().optional(),
  remarks: z
    .array(
      z.object({
        field: z.string().trim().min(1),
        message: z.string().trim().min(1),
        section: z.string().trim().optional()
      })
    )
    .optional()
});

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

  // The same checks as the moderation buttons (status, payment, UPC, merging a copy into its
  // original): this endpoint must not be a shortcut around them.
  if (parsed.data.action === "approve") {
    const approved = await approveReleaseByAdmin({
      prisma,
      adminId: session.user.id,
      releaseId: parsed.data.releaseId,
      upc: parsed.data.upc ?? ""
    });
    if (!approved) return NextResponse.json({ error: "Release not found" }, { status: 404 });
    if ("error" in approved) {
      if (approved.error === "UPC_ALREADY_EXISTS") {
        return NextResponse.json({ error: "UPC уже используется в другом релизе." }, { status: 409 });
      }
      if (approved.error === "STATUS_TRANSITION_NOT_ALLOWED") {
        return NextResponse.json({ error: "Релиз нельзя принять в текущем статусе." }, { status: 409 });
      }
      return NextResponse.json({ error: approved.error }, { status: 400 });
    }
    const response: AdminReleaseDecisionResponse = {
      ok: true,
      releaseId: approved.releaseId,
      status: "approved",
      message: "mergedFromReleaseId" in approved
        ? "Повторная модерация принята: изменения перенесены в исходный релиз."
        : "Релиз принят."
    };
    return NextResponse.json(response, { status: 200 });
  }

  const rejected = await rejectReleaseByAdmin({
    prisma,
    adminId: session.user.id,
    releaseId: parsed.data.releaseId,
    reason: parsed.data.comment ?? "",
    remarks: parsed.data.remarks,
    action: parsed.data.action
  });
  if (!rejected.ok) {
    const status = rejected.error === "Release not found" ? 404 : rejected.error.startsWith("Отклонение доступно") ? 409 : 400;
    return NextResponse.json({ error: rejected.error }, { status });
  }

  const response: AdminReleaseDecisionResponse = {
    ok: true,
    releaseId: parsed.data.releaseId,
    status: parsed.data.action === "reject" ? "rejected" : "changes_required",
    message: parsed.data.action === "reject" ? "Релиз отклонён." : "Релиз отправлен на доработку.",
    remarks: rejected.remarks
  };
  return NextResponse.json(response, { status: 200 });
}
