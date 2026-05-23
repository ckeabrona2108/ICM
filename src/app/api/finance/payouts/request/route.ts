import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type {
  PayoutRequestBody,
  PayoutRequestFailureResponse,
  PayoutRequestSuccessResponse
} from "@/lib/api/contracts";
import {
  payoutRequestSchema,
  validatePayoutRequest
} from "@/lib/finance-policy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as PayoutRequestBody | null;
  const parsed = payoutRequestSchema.safeParse(payload);

  if (!parsed.success) {
    const response: PayoutRequestFailureResponse = {
      ok: false,
      errors: [
        {
          code: "invalid_payload",
          field: "payload",
          message: "Некорректное тело запроса."
        }
      ]
    };
    return NextResponse.json(response, { status: 400 });
  }

  const issues = validatePayoutRequest(parsed.data);
  if (issues.length > 0) {
    const response: PayoutRequestFailureResponse = {
      ok: false,
      errors: issues
    };
    return NextResponse.json(response, { status: 400 });
  }

  const requisites = parsed.data.requisites;

  const payout = await prisma.payouts.create({
    data: {
      id: randomUUID(),
      userId: session.user.id,
      amount: Math.abs(parsed.data.amount),
      recieverName: requisites.recipientName,
      accountNumber: requisites.accountNumber || requisites.paypalEmail || "",
      confirmed: false
    },
    select: { id: true }
  });

  const response: PayoutRequestSuccessResponse = {
    ok: true,
    payoutRequestId: payout.id,
    message: "Заявка на выплату создана."
  };

  return NextResponse.json(response, { status: 201 });
}
