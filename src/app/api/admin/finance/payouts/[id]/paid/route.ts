import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { AdminPayoutStatus } from "@/lib/admin-payouts-service";
import { mapConfirmedToPayoutStatus } from "@/lib/admin-payouts-service";
import { prisma } from "@/lib/prisma";

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
    select: { id: true, confirmed: true }
  });

  if (!payout) {
    return NextResponse.json({ error: "Заявка на выплату не найдена." }, { status: 404 });
  }

  const currentStatus = mapConfirmedToPayoutStatus(payout.confirmed);
  if (currentStatus === "PAID") {
    return NextResponse.json(
      {
        ok: true,
        payoutRequestId: payout.id,
        status: "PAID" as AdminPayoutStatus
      },
      { status: 200 }
    );
  }

  const updated = await prisma.payouts.update({
    where: { id: params.id },
    data: { confirmed: true },
    select: { id: true }
  });

  return NextResponse.json(
    {
      ok: true,
      payoutRequestId: updated.id,
      status: "PAID" as AdminPayoutStatus
    },
    { status: 200 }
  );
}
