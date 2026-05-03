import { PayoutRequestStatus } from "@prisma/client";
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

  const payout = await prisma.payoutRequest.findUnique({
    where: { id: payoutId },
    select: { id: true, status: true }
  });

  if (!payout) {
    return NextResponse.json({ error: "Payout request not found" }, { status: 404 });
  }

  if (payout.status !== PayoutRequestStatus.REQUESTED) {
    return NextResponse.json(
      { ok: true, payoutRequestId: payout.id, status: payout.status },
      { status: 200 }
    );
  }

  const updated = await prisma.payoutRequest.update({
    where: { id: payoutId },
    data: { status: PayoutRequestStatus.PROCESSING }
  });

  return NextResponse.json(
    { ok: true, payoutRequestId: updated.id, status: updated.status },
    { status: 200 }
  );
}

