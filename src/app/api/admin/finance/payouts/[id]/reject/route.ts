import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { AdminPayoutStatus } from "@/lib/admin-payouts-service";
import { mapConfirmedToPayoutStatus } from "@/lib/admin-payouts-service";
import { prisma } from "@/lib/prisma";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { formatRubCurrency } from "@/lib/currency-format";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payout = await prisma.payouts.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, amount: true, confirmed: true }
  });

  if (!payout) {
    return NextResponse.json({ error: "Заявка на выплату не найдена." }, { status: 404 });
  }

  const currentStatus = mapConfirmedToPayoutStatus(payout.confirmed);
  if (currentStatus === "REJECTED") {
    return NextResponse.json(
      {
        ok: true,
        payoutRequestId: payout.id,
        status: "REJECTED" as AdminPayoutStatus
      },
      { status: 200 }
    );
  }

  const updated = await prisma.payouts.update({
    where: { id: params.id },
    data: { confirmed: null },
    select: { id: true }
  });

  await deliverUserNotificationSafely(prisma, {
    id: `payout-rejected-${payout.id}`,
    userId: payout.userId,
    kind: "payout_rejected",
    title: "Заявка на выплату отклонена",
    message: `Заявка на ${formatRubCurrency(payout.amount ?? 0)} отклонена администратором.`,
    href: "/dashboard/finance",
    resetReadState: true
  });

  return NextResponse.json(
    {
      ok: true,
      payoutRequestId: updated.id,
      status: "REJECTED" as AdminPayoutStatus
    },
    { status: 200 }
  );
}
