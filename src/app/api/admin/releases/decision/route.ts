import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { AdminReleaseDecisionResponse } from "@/lib/api/contracts";
import { authOptions } from "@/lib/auth";
import { canManageReleases } from "@/lib/admin-release-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  releaseId: z.string().trim().min(1),
  action: z.enum(["approve", "request_changes", "reject"]),
  upc: z.string().trim().optional(),
  comment: z.string().trim().optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const release = await prisma.release.findUnique({
    where: { id: parsed.data.releaseId },
    select: { id: true, status: true }
  });
  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (parsed.data.action === "approve") {
    const upc = parsed.data.upc?.trim() || null;
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
        upc
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
  await prisma.release.update({
    where: { id: release.id },
    data: {
      status: "rejected",
      rejectReason: comment
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
