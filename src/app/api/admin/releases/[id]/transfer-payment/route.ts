import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageReleasesSession } from "@/lib/admin-release-service";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { prisma } from "@/lib/prisma";
import { transferReleasePayment } from "@/lib/release-payment-transfer";

export const dynamic = "force-dynamic";

/** Moves the payment of a paid release sent back for changes to this release (its replacement). */
export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageReleasesSession({ prisma, userId: session.user.id, role: session.user.role }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const toReleaseId = context.params.id?.trim();
  const payload = (await request.json().catch(() => null)) as { fromReleaseId?: unknown } | null;
  const fromReleaseId = typeof payload?.fromReleaseId === "string" ? payload.fromReleaseId.trim() : "";
  if (!toReleaseId || !fromReleaseId) {
    return NextResponse.json({ error: "Укажите релиз, с которого переносится оплата." }, { status: 400 });
  }

  const moved = await prisma.$transaction((tx) =>
    transferReleasePayment(tx, { fromReleaseId, toReleaseId, adminId: session.user.id })
  );
  if (!moved) {
    return NextResponse.json(
      { error: "Оплату перенести нельзя: исходный релиз не оплачен, уже выпущен, закрыт или принадлежит другому артисту." },
      { status: 409 }
    );
  }

  const release = await prisma.release.findUnique({ where: { id: toReleaseId }, select: { userId: true } });
  if (release) {
    await deliverUserNotificationSafely(prisma, {
      id: `release-payment-transferred-${toReleaseId}`,
      userId: release.userId,
      kind: "release_payment_transferred",
      title: "Оплата перенесена",
      message: `Оплата релиза «${moved.fromTitle}» перенесена на релиз «${moved.toTitle}»: платить повторно не нужно. Релиз на модерации.`,
      href: "/dashboard/releases",
      sendEmail: false,
      resetReadState: true
    });
  }

  return NextResponse.json({ ok: true, ...moved }, { status: 200 });
}
