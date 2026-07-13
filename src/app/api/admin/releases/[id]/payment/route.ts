import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canManageReleasesSession,
  updateReleasePaymentStatusByAdmin
} from "@/lib/admin-release-service";

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

  if (!payload || typeof payload !== "object" || typeof (payload as { paid?: unknown }).paid !== "boolean") {
    return NextResponse.json({ error: "Field `paid` must be boolean." }, { status: 400 });
  }

  const updated = await updateReleasePaymentStatusByAdmin({
    prisma,
    adminId: session.user.id,
    releaseId,
    paid: (payload as { paid: boolean }).paid
  });
  if (!updated) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      releaseId,
      confirmed: updated.confirmed,
      payment_status: updated.confirmed ? "paid" : "unpaid",
      payment_label: updated.confirmed ? "Оплачен" : "Не оплачен"
    },
    { status: 200 }
  );
}
