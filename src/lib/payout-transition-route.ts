import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import type { AdminPayoutStatus } from "@/lib/admin-payouts-service";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { formatRubCurrency } from "@/lib/currency-format";

type TargetStatus = Exclude<AdminPayoutStatus, "REQUESTED">;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function createPayoutDebitTransaction(tx: any, params: {
  userId: string;
  payoutId: string;
  amount: number;
  processedAt: Date;
}) {
  const data: any = {
    id: randomUUID(),
    userId: params.userId,
    amount: -Math.abs(params.amount),
    type: "PAYOUT",
    status: "COMPLETED",
    description: `Payout request ${params.payoutId}`,
    processedAt: params.processedAt,
    metadata: { payoutRequestId: params.payoutId }
  };

  await tx.transaction.create({ data, select: { id: true } });
}

export async function handlePayoutTransition(params: {
  session: { user: { role?: string } } | null;
  prisma: PrismaClient;
  id: string;
  status: TargetStatus;
  rejectionReason?: string;
  notify?: typeof deliverUserNotificationSafely;
}) {
  if (!params.session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (params.session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rejectionReason = params.rejectionReason?.trim() ?? "";
  if (params.status === "REJECTED" && rejectionReason.length < 3) {
    return NextResponse.json({ error: "Укажите причину отклонения (минимум 3 символа)." }, { status: 400 });
  }

  const result = await params.prisma.$transaction(async (tx) => {
    const now = new Date();
    const current = await tx.payouts.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true, amount: true, status: true, requisites: true }
    });
    if (!current) return { payout: null, changed: false };
    // The conditional write takes the row lock. All terminal transitions use
    // the same predicate, so a competing action cannot overwrite the winner.
    const changed = await tx.payouts.updateMany({
      where: { id: params.id, status: { in: ["REQUESTED", "PROCESSING"] } },
      data: {
        status: params.status,
        updatedAt: now,
        ...(params.status === "PAID" ? { confirmed: true, processedAt: now, paidAt: now } : {}),
        ...(params.status === "REJECTED" ? {
          confirmed: null,
          rejectedAt: now,
          requisites: { ...asRecord(current.requisites), rejectionReason }
        } : {}),
        ...(params.status === "PROCESSING" ? { processedAt: now } : {})
      }
    });
    if (changed.count && params.status === "PAID") {
      const payoutAmount = Number(current.amount ?? 0);
      if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
        throw new Error("Invalid payout amount");
      }
      await createPayoutDebitTransaction(tx, {
        userId: current.userId,
        payoutId: current.id,
        amount: payoutAmount,
        processedAt: now
      });
    }
    return {
      payout: { ...current, status: changed.count ? params.status : current.status },
      changed: changed.count > 0
    };
  }, { isolationLevel: "ReadCommitted" });

  if (!result.payout) return NextResponse.json({ error: "Заявка на выплату не найдена." }, { status: 404 });
  if (result.payout.status !== params.status) {
    return NextResponse.json({ error: "Заявка уже завершена другим действием. Обновите данные." }, { status: 409 });
  }
  if (result.changed) {
    const paid = params.status === "PAID";
    const processing = params.status === "PROCESSING";
    await (params.notify ?? deliverUserNotificationSafely)(params.prisma, {
      id: `payout-${processing ? "processing" : paid ? "paid" : "rejected"}-${result.payout.id}`,
      userId: result.payout.userId,
      kind: processing ? "payout_requested" : paid ? "payout_paid" : "payout_rejected",
      title: processing
        ? "Заявка передана в обработку"
        : paid ? "Выплата отправлена" : "Заявка на выплату отклонена",
      message: processing
        ? `Заявка на ${formatRubCurrency(result.payout.amount ?? 0)} передана в обработку. Мы сообщим после отправки выплаты.`
        : paid
          ? `Выплата на ${formatRubCurrency(result.payout.amount ?? 0)} отправлена. Зачисление в банк может занять до 48 часов.`
          : `Заявка на ${formatRubCurrency(result.payout.amount ?? 0)} отклонена. Причина: ${rejectionReason}. Вы можете создать новую заявку за этот квартал.`,
      href: "/dashboard/finance", resetReadState: true
    });
  }
  return NextResponse.json({ ok: true, payoutRequestId: result.payout.id, status: params.status });
}
