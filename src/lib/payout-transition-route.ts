import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import type { AdminPayoutStatus } from "@/lib/admin-payouts-service";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { formatRubCurrency } from "@/lib/currency-format";

type TargetStatus = Exclude<AdminPayoutStatus, "REQUESTED">;

export async function handlePayoutTransition(params: {
  session: { user: { role?: string } } | null;
  prisma: PrismaClient;
  id: string;
  status: TargetStatus;
  notify?: typeof deliverUserNotificationSafely;
}) {
  if (!params.session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (params.session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await params.prisma.$transaction(async (tx) => {
    const now = new Date();
    // The conditional write takes the row lock. All terminal transitions use
    // the same predicate, so a competing action cannot overwrite the winner.
    const changed = await tx.payouts.updateMany({
      where: { id: params.id, status: { in: ["REQUESTED", "PROCESSING"] } },
      data: {
        status: params.status,
        updatedAt: now,
        ...(params.status === "PAID" ? { confirmed: true, processedAt: now, paidAt: now } : {}),
        ...(params.status === "REJECTED" ? { confirmed: null, rejectedAt: now } : {}),
        ...(params.status === "PROCESSING" ? { processedAt: now } : {})
      }
    });
    const payout = await tx.payouts.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true, amount: true, status: true }
    });
    if (changed.count && payout && params.status === "PAID") {
      if (!Number.isFinite(payout.amount) || (payout.amount ?? 0) <= 0) {
        throw new Error("Invalid payout amount");
      }
      await tx.transaction.create({
        data: {
          id: randomUUID(), userId: payout.userId, amount: -Math.abs(payout.amount!),
          type: "PAYOUT", status: "COMPLETED", description: `Payout request ${payout.id}`,
          payoutId: payout.id, processedAt: now, metadata: { payoutRequestId: payout.id }
        }
      });
    }
    return { payout, changed: changed.count > 0 };
  }, { isolationLevel: "ReadCommitted" });

  if (!result.payout) return NextResponse.json({ error: "Заявка на выплату не найдена." }, { status: 404 });
  if (result.payout.status !== params.status) {
    return NextResponse.json({ error: "Заявка уже завершена другим действием. Обновите данные." }, { status: 409 });
  }
  if (result.changed && params.status !== "PROCESSING") {
    const paid = params.status === "PAID";
    await (params.notify ?? deliverUserNotificationSafely)(params.prisma, {
      id: `payout-${paid ? "paid" : "rejected"}-${result.payout.id}`,
      userId: result.payout.userId,
      kind: paid ? "payout_paid" : "payout_rejected",
      title: paid ? "Выплата одобрена" : "Заявка на выплату отклонена",
      message: `Заявка на ${formatRubCurrency(result.payout.amount ?? 0)} ${paid ? "подтверждена" : "отклонена"} администратором.`,
      href: "/dashboard/finance", resetReadState: true
    });
  }
  return NextResponse.json({ ok: true, payoutRequestId: result.payout.id, status: params.status });
}
