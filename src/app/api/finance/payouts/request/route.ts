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
import {
  isAnyPrismaColumnMissingError,
  isPrismaConnectionError,
  isPrismaPoolTimeoutError,
  retryPrismaSerializationConflict
} from "@/lib/prisma-errors";
import { getCurrentPayoutWindowState } from "@/lib/payout-schedule";
import { getPayoutPeriod, isActivePayoutStatus } from "@/lib/payout-request";

export const dynamic = "force-dynamic";

function unavailableResponse(message: string, status = 503) {
  const response: PayoutRequestFailureResponse = {
    ok: false,
    errors: [{ code: "temporarily_unavailable", field: "server", message }]
  };
  return NextResponse.json(response, { status });
}

async function hasPayoutLedgerSchema(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ ready: boolean }>>`
    SELECT COUNT(*) = 3 AS "ready"
    FROM information_schema.columns
    WHERE table_schema = 'icecream'
      AND table_name = 'payouts'
      AND column_name IN ('status', 'method', 'requisites')
  `;
  return rows[0]?.ready === true;
}

async function countActivePayoutRequests(tx: typeof prisma, userId: string): Promise<number> {
  return tx.payouts.count({
    where: {
      userId,
      status: { in: ["REQUESTED", "PROCESSING"] }
    }
  });
}

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

  try {
    if (!(await hasPayoutLedgerSchema())) {
      return unavailableResponse("Сервис заявок обновляется. Попробуйте через несколько минут.");
    }
  } catch (error) {
    console.error("Unable to verify payout schema", error);
    return unavailableResponse("Сервис заявок временно недоступен. Попробуйте позже.");
  }

  let result: { issues: PayoutRequestFailureResponse["errors"]; payoutId: string | null };
  try {
    result = await retryPrismaSerializationConflict(() => prisma.$transaction(
    async (tx) => {
      // An interactive transaction uses one connection. Running the report
      // and balance lookups concurrently could exhaust its five-second
      // default timeout and close the transaction before a later query ran.
      const reports = await listUserReports(tx as typeof prisma, session.user.id);
      const totals = await getUserBalanceTotals(tx as typeof prisma, session.user.id);
      const payoutWindow = await getCurrentPayoutWindowState(tx as typeof prisma);
      const activePayoutRequestsCount = await countActivePayoutRequests(tx as typeof prisma, session.user.id);
      const existingPayouts = await tx.payouts.findMany({
        where: { userId: session.user.id },
        select: { status: true, confirmed: true, requisites: true }
      });
      const reportStatuses = reports.map((report) =>
        report.lifecycleState === "agreed"
          ? "agreed" as const
          : report.lifecycleState === "changes_requested"
            ? "changes_requested" as const
            : "ready_to_confirm" as const
      );
      const selectedReports = reports.filter(
        (report) => report.lifecycleState === "agreed" &&
          report.quarter === parsed.data.quarter &&
          report.year === parsed.data.year
      );
      const selectedQuarterBalance = selectedReports.reduce((sum, report) => sum + report.amount, 0);
      const duplicateQuarterRequest = existingPayouts.some((payout) => {
        const period = getPayoutPeriod(payout.requisites);
        const matchesSelectedPeriod = period.quarter === parsed.data.quarter && period.year === parsed.data.year;
        return matchesSelectedPeriod && (isActivePayoutStatus(payout.status) || payout.confirmed === true);
      });
      const documentKeyPrefix = `private/payout-documents/${session.user.id}/`;
      const documentBelongsToUser = parsed.data.documents.supportingDocument.key.startsWith(documentKeyPrefix);
      const issues = validatePayoutRequest(parsed.data, {
        availableBalance: totals.availableToWithdraw,
        pendingReportsCount: reportStatuses.filter((status) => status === "ready_to_confirm").length,
        minimumPayoutAmount: readMinimumPayoutAmount(),
        reportStatuses,
        payoutWindowOpen: payoutWindow.isOpen,
        payoutWindowMessage: payoutWindow.message,
        activePayoutRequestsCount,
        selectedQuarterBalance,
        duplicateQuarterRequest
      });
      if (!documentBelongsToUser) {
        issues.push({
          code: "forbidden",
          field: "documents.supportingDocument",
          message: "Документ должен быть загружен из текущего кабинета."
        });
      }
      if (!selectedReports.some((report) => report.id === parsed.data.documents.reportId)) {
        issues.push({
          code: "invalid",
          field: "documents.reportId",
          message: "Отчетная ведомость должна соответствовать выбранному кварталу."
        });
      }
      if (issues.length > 0) return { issues, payoutId: null };

      const requisites = parsed.data.requisites;
      const methodByInput = {
        bank_transfer: "BANK_TRANSFER",
        paypal: "PAYPAL",
        other: "OTHER"
      } as const;
      const payout = await tx.payouts.create({
        data: {
          id: randomUUID(),
          userId: session.user.id,
          amount: parsed.data.amount,
          status: "REQUESTED",
          method: methodByInput[requisites.payoutMethod],
          requisites: {
            recipientName: requisites.recipientName,
            payoutMethod: requisites.payoutMethod,
            accountNumber: requisites.accountNumber,
            bankName: requisites.bankName,
            taxId: requisites.taxId,
            bankBik: requisites.bankBik,
            quarter: parsed.data.quarter,
            year: parsed.data.year,
            taxStatus: parsed.data.taxStatus,
            reportId: parsed.data.documents.reportId,
            supportingDocument: parsed.data.documents.supportingDocument,
            receiptDetails: parsed.data.taxStatus === "individual"
              ? parsed.data.documents.receiptDetails
              : undefined,
            receiptAcknowledged: parsed.data.taxStatus === "individual"
              ? parsed.data.documents.receiptAcknowledged
              : undefined,
            payoutWindow: payoutWindow.currentWindow
              ? {
                  label: payoutWindow.currentWindow.label,
                  periodLabel: payoutWindow.currentWindow.periodLabel,
                  startsAt: payoutWindow.currentWindow.startsAt,
                  endsAt: payoutWindow.currentWindow.endsAt
                }
              : null
          },
          recieverName: requisites.recipientName,
          accountNumber: requisites.accountNumber,
          confirmed: false
        },
        select: { id: true }
      });
      return { issues: [], payoutId: payout.id };
    },
    {
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 20_000
    }
    ));
  } catch (error) {
    console.error("Unable to create payout request", error);

    if (isAnyPrismaColumnMissingError(error, ["payouts.status", "payouts.method", "payouts.requisites", "status", "method", "requisites"])) {
      return unavailableResponse("Сервис заявок обновляется. Попробуйте через несколько минут.");
    }
    if (isPrismaConnectionError(error) || isPrismaPoolTimeoutError(error)) {
      return unavailableResponse("Сервис заявок временно недоступен. Попробуйте позже.");
    }
    return unavailableResponse("Не удалось создать заявку. Попробуйте позже.", 500);
  }

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
