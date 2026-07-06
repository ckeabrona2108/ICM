import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageReleases, canManageReleasesSession, rejectReleaseByAdmin } from "@/lib/admin-release-service";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canManageReleasesSession({ prisma, userId: session.user.id, role: session.user.role }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "Release id is required" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const rawReason =
    payload && typeof payload === "object" && "reason" in payload
      ? String((payload as { reason?: unknown }).reason ?? "")
      : "";
  const result = await rejectReleaseByAdmin({
    prisma,
    adminId: session.user.id,
    releaseId,
    reason: rawReason
  });
  if (!result.ok) {
    if (result.error === "Release not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      releaseId,
      status: "changes_required",
      reason: result.reason,
      message: "Релиз отправлен на доработку."
    },
    { status: 200 }
  );
}
