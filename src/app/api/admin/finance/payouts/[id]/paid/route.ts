import {
  PayoutRequestStatus,
  TransactionStatus,
  TransactionType
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const payoutId = params.id;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const payout = await tx.payoutRequest.findUnique({
      where: { id: payoutId },
      select: { id: true, userId: true, status: true }
    });

    if (!payout) {
      return { kind: "not_found" as const };
    }

    if (payout.status === PayoutRequestStatus.PAID) {
      return { kind: "ok" as const, payoutId: payout.id, status: payout.status };
    }

    if (
      payout.status !== PayoutRequestStatus.REQUESTED &&
      payout.status !== PayoutRequestStatus.PROCESSING
    ) {
      return { kind: "forbidden_transition" as const, status: payout.status };
    }

    const updated = await tx.payoutRequest.update({
      where: { id: payoutId },
      data: { status: PayoutRequestStatus.PAID, processedAt: now }
    });

    await tx.transaction.updateMany({
      where: {
        userId: payout.userId,
        type: TransactionType.PAYOUT,
        reference: payout.id,
        status: TransactionStatus.PENDING
      },
      data: { status: TransactionStatus.COMPLETED, processedAt: now }
    });

    return { kind: "ok" as const, payoutId: updated.id, status: updated.status };
  });

  if (result.kind === "not_found") {
    return NextResponse.json({ error: "Payout request not found" }, { status: 404 });
  }

  if (result.kind === "forbidden_transition") {
    return NextResponse.json(
      { error: "Invalid payout status transition" },
      { status: 422 }
    );
  }

  return NextResponse.json(
    { ok: true, payoutRequestId: result.payoutId, status: result.status },
    { status: 200 }
  );
}

