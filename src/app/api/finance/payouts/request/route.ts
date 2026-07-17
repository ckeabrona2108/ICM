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
import { getUserBalanceTotals } from "@/lib/finance-service";
import { readMinimumPayoutAmount } from "@/lib/finance-dashboard-server";
import { prisma } from "@/lib/prisma";
import { listUserReports } from "@/lib/report-service";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import { formatRubCurrency } from "@/lib/currency-format";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = enforceRateLimit({
    key: `finance:payout:${session.user.id}`,
    limit: 5,
    windowMs: 10 * 60_000
  });
  if (limited) return limited;

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

  const result = await prisma.$transaction(
    async (tx) => {
      const [totals, reports] = await Promise.all([
        getUserBalanceTotals(tx as typeof prisma, session.user.id),
        listUserReports(tx as typeof prisma, session.user.id)
      ]);
      const reportStatuses = reports.map((report) =>
        report.lifecycleState === "agreed"
          ? "agreed" as const
          : report.lifecycleState === "changes_requested"
            ? "changes_requested" as const
            : "ready_to_confirm" as const
      );
      const issues = validatePayoutRequest(parsed.data, {
        availableBalance: totals.availableToWithdraw,
        pendingReportsCount: reportStatuses.filter((status) => status === "ready_to_confirm").length,
        minimumPayoutAmount: readMinimumPayoutAmount(),
        reportStatuses
      });
      if (issues.length > 0) return { issues, payoutId: null };

      const requisites = parsed.data.requisites;
      const payout = await tx.payouts.create({
        data: {
          id: randomUUID(),
          userId: session.user.id,
          amount: parsed.data.amount,
          recieverName: requisites.recipientName,
          accountNumber: requisites.accountNumber || requisites.paypalEmail || "",
          confirmed: false
        },
        select: { id: true }
      });
      return { issues: [], payoutId: payout.id };
    },
    { isolationLevel: "Serializable" }
  );

  if (result.issues.length > 0 || !result.payoutId) {
    const response: PayoutRequestFailureResponse = { ok: false, errors: result.issues };
    return NextResponse.json(response, { status: 400 });
  }

  const response: PayoutRequestSuccessResponse = {
    ok: true,
    payoutRequestId: result.payoutId,
    message: "Заявка на выплату создана."
  };

  await deliverUserNotificationSafely(prisma, {
    id: `payout-requested-${result.payoutId}`,
    userId: session.user.id,
    kind: "payout_requested",
    title: "Заявка на вывод отправлена",
    message: `Сумма: ${formatRubCurrency(parsed.data.amount)}.`,
    href: "/dashboard/finance"
  });

  return NextResponse.json(response, { status: 201 });
}
