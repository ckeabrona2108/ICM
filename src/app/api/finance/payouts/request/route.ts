import {
  FinanceReportStatus,
  Prisma,
  PayoutMethod,
  PayoutRequestStatus,
  TransactionStatus,
  TransactionType
} from "@prisma/client";
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
import { readMinimumPayoutAmount } from "@/lib/finance-dashboard-server";
import { getUserBalanceTotals } from "@/lib/finance-service";
import { prisma } from "@/lib/prisma";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";

function toPayoutMethod(value: string): PayoutMethod {
  if (value === "paypal") return PayoutMethod.PAYPAL;
  if (value === "other") return PayoutMethod.OTHER;
  return PayoutMethod.BANK_TRANSFER;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = payoutRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const body: PayoutRequestBody = parsed.data;

  let reports;
  try {
    reports = await prisma.financeReport.findMany({
      where: { userId: session.user.id },
      select: { status: true }
    });
  } catch (error) {
    if (isPrismaTableMissingError(error, "FinanceReport")) {
      return NextResponse.json(
        {
          ok: false,
          errors: [
            {
              code: "service_unavailable",
              field: "finance",
              message:
                "Финансовый модуль еще не инициализирован. Выполните миграции базы данных."
            }
          ]
        } satisfies PayoutRequestFailureResponse,
        { status: 503 }
      );
    }
    throw error;
  }

  const totals = await getUserBalanceTotals(prisma, session.user.id);
  const availableBalance = totals.availableToWithdraw;

  const reportStatuses = reports.map((report) =>
    report.status === FinanceReportStatus.AGREED
      ? "agreed"
      : "ready_to_confirm"
  );

  const pendingReportsCount = reportStatuses.filter(
    (status) => status === "ready_to_confirm"
  ).length;

  const validationIssues = validatePayoutRequest({
    ...body,
    availableBalance,
    pendingReportsCount,
    minimumPayoutAmount: readMinimumPayoutAmount(),
    reportStatuses
  });

  if (validationIssues.length > 0) {
    const response: PayoutRequestFailureResponse = {
      ok: false,
      errors: validationIssues
    };
    return NextResponse.json(response, { status: 422 });
  }

  let payout;
  try {
    payout = await prisma.$transaction(async (tx) => {
      const created = await tx.payoutRequest.create({
        data: {
          userId: session.user.id,
          amount: new Prisma.Decimal(body.amount),
          currency: "RUB",
          method: toPayoutMethod(body.requisites.payoutMethod),
          requisites: body.requisites as unknown as Prisma.InputJsonValue,
          status: PayoutRequestStatus.REQUESTED
        },
        select: { id: true }
      });

      await tx.transaction.create({
        data: {
          userId: session.user.id,
          amount: new Prisma.Decimal(-Math.abs(body.amount)),
          currency: "RUB",
          type: TransactionType.PAYOUT,
          status: TransactionStatus.PENDING,
          reference: created.id,
          description: "Запрос выплаты"
        }
      });

      return created;
    });
  } catch (error) {
    if (
      isPrismaTableMissingError(error, "PayoutRequest") ||
      isPrismaTableMissingError(error, "Transaction")
    ) {
      return NextResponse.json(
        {
          ok: false,
          errors: [
            {
              code: "service_unavailable",
              field: "finance",
              message:
                "Финансовый модуль еще не инициализирован. Выполните миграции базы данных."
            }
          ]
        } satisfies PayoutRequestFailureResponse,
        { status: 503 }
      );
    }
    throw error;
  }

  const response: PayoutRequestSuccessResponse = {
    ok: true,
    payoutRequestId: payout.id,
    message: "Заявка на выплату создана и передана в обработку."
  };

  return NextResponse.json(response, { status: 201 });
}
