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
import { getPayoutPeriod, getPayoutPeriods } from "@/lib/payout-request";
import {
  allocatePayoutAcrossQuarters,
  computeQuarterPayoutStates,
  formatPayoutPeriods,
  quarterKey,
  type PayoutPeriodShare
} from "@/lib/payout-quarter";
import { getUserContractStatus } from "@/lib/contract-verification";
import { notifyAdminPayoutRequested } from "@/lib/telegram-notifier";
import { requireSecurityCode } from "@/lib/security-code-route";

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

  let contractNumber: number | null = null;
  try {
    const contract = await getUserContractStatus({ prisma, userId: session.user.id });
    if (contract.isVerified && contract.contractNumber) contractNumber = contract.contractNumber;
  } catch (error) {
    console.error("Unable to verify user contract for payout request", error);
    return unavailableResponse("Не удалось проверить договор. Попробуйте позже.");
  }

  if (!contractNumber) {
    const response: PayoutRequestFailureResponse = {
      ok: false,
      errors: [{
        code: "contract_required",
        field: "contract",
        message: "Для заявки на выплату требуется подтверждённый администратором лицензионный договор."
      }]
    };
    return NextResponse.json(response, { status: 400 });
  }

  // Quarters withdrawn together; an older client sends one quarter with its report.
  const requestedPeriods = Array.from(
    new Map(
      (parsed.data.periods ?? [{ quarter: parsed.data.quarter, year: parsed.data.year, reportId: parsed.data.documents.reportId }])
        .map((period) => [quarterKey(period.quarter, period.year)!, period])
    ).values()
  );

  // The money leaves only with a code from the artist's Telegram, VK or confirmed email.
  const securityCode = await requireSecurityCode(session.user.id, "payout");
  if (!securityCode.ok) return securityCode.response;

  let result: { issues: PayoutRequestFailureResponse["errors"]; payoutId: string | null; shares: PayoutPeriodShare[] };
  try {
    result = await retryPrismaSerializationConflict(() => prisma.$transaction(
    async (tx) => {
      // An interactive transaction uses one connection. Running the report
      // and balance lookups concurrently could exhaust its five-second
      // default timeout and close the transaction before a later query ran.
      const reports = await listUserReports(tx as typeof prisma, session.user.id);
      const totals = await getUserBalanceTotals(tx as typeof prisma, session.user.id);
      const payoutWindow = await getCurrentPayoutWindowState(tx as typeof prisma);
      const existingPayouts = await tx.payouts.findMany({
        where: { userId: session.user.id },
        select: { status: true, confirmed: true, amount: true, requisites: true }
      });
      const reportStatuses = reports.map((report) =>
        report.lifecycleState === "agreed"
          ? "agreed" as const
          : report.lifecycleState === "changes_requested"
            ? "changes_requested" as const
            : "ready_to_confirm" as const
      );
      // What is left of each quarter after earlier requests: a quarter can be withdrawn in parts,
      // and money added to it later (a supplement, an admin credit) can still be withdrawn.
      const quarterStates = computeQuarterPayoutStates(
        reports.map((report) => ({
          quarter: report.quarter,
          year: report.year,
          amount: report.amount,
          agreed: report.lifecycleState === "agreed"
        })),
        existingPayouts.map((payout) => ({
          ...getPayoutPeriod(payout.requisites),
          amount: Number(payout.amount ?? 0),
          status: String(payout.status),
          confirmed: payout.confirmed,
          periods: getPayoutPeriods(payout.requisites, payout.amount)
        }))
      );
      const selectedStates = requestedPeriods.map((period) => quarterStates.get(quarterKey(period.quarter, period.year)!));
      const selectedQuarterBalance = selectedStates.reduce((sum, state) => sum + (state?.remaining ?? 0), 0);
      const duplicateQuarterRequest = selectedStates.some((state) => state?.hasOpenRequest);
      const documentKeyPrefix = `private/payout-documents/${session.user.id}/`;
      const documentBelongsToUser = parsed.data.documents.supportingDocument.key.startsWith(documentKeyPrefix);
      const issues = validatePayoutRequest(parsed.data, {
        availableBalance: totals.availableToWithdraw,
        pendingReportsCount: reportStatuses.filter((status) => status === "ready_to_confirm").length,
        minimumPayoutAmount: readMinimumPayoutAmount(),
        reportStatuses,
        payoutWindowOpen: payoutWindow.isOpen,
        payoutWindowMessage: payoutWindow.message,
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
      const reportMismatch = requestedPeriods.some((period) => !reports.some(
        (report) => report.id === period.reportId &&
          report.lifecycleState === "agreed" &&
          report.quarter === period.quarter &&
          report.year === period.year
      ));
      if (reportMismatch) {
        issues.push({
          code: "invalid",
          field: "documents.reportId",
          message: "Отчетная ведомость должна соответствовать выбранному кварталу."
        });
      }
      const shares = issues.length > 0
        ? null
        : allocatePayoutAcrossQuarters(
            parsed.data.amount,
            requestedPeriods.map((period) => ({
              ...period,
              remaining: quarterStates.get(quarterKey(period.quarter, period.year)!)?.remaining ?? 0
            }))
          );
      if (issues.length === 0 && !shares?.length) {
        issues.push({
          code: "invalid",
          field: "amount",
          message: "Сумма выплаты превышает доступную сумму по выбранным кварталам."
        });
      }
      if (issues.length > 0 || !shares?.length) return { issues, payoutId: null, shares: [] };
      const first = shares[0]!;

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
            contractNumber,
            recipientName: requisites.recipientName,
            payoutMethod: requisites.payoutMethod,
            accountNumber: requisites.accountNumber,
            bankName: requisites.bankName,
            taxId: requisites.taxId,
            bankBik: requisites.bankBik,
            // The first (oldest) quarter stays in quarter/year/reportId for older readers.
            quarter: first.quarter,
            year: first.year,
            periods: shares.map((share) => ({ ...share })),
            taxStatus: parsed.data.taxStatus,
            reportId: first.reportId ?? parsed.data.documents.reportId,
            supportingDocument: parsed.data.documents.supportingDocument,
            receiptDetails: parsed.data.taxStatus === "individual"
              ? {
                  ...parsed.data.documents.receiptDetails,
                  contractNumber: String(contractNumber)
                }
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
      return { issues: [], payoutId: payout.id, shares };
    },
    {
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 20_000
    }
    ));
  } catch (error) {
    console.error("Unable to create payout request", error);
    await securityCode.release();

    if (isAnyPrismaColumnMissingError(error, ["payouts.status", "payouts.method", "payouts.requisites", "status", "method", "requisites"])) {
      return unavailableResponse("Сервис заявок обновляется. Попробуйте через несколько минут.");
    }
    if (isPrismaConnectionError(error) || isPrismaPoolTimeoutError(error)) {
      return unavailableResponse("Сервис заявок временно недоступен. Попробуйте позже.");
    }
    return unavailableResponse("Не удалось создать заявку. Попробуйте позже.", 500);
  }

  if (result.issues.length > 0 || !result.payoutId) {
    await securityCode.release();
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
    message: `Сумма: ${formatRubCurrency(parsed.data.amount)} за ${formatPayoutPeriods(result.shares)}. Договор № ${contractNumber}.`,
    href: "/dashboard/finance"
  });

  // The admin learns about the request right away; Telegram retries must not delay the artist.
  void notifyAdminPayoutRequested({
    artistName: session.user.name?.trim() || session.user.email || session.user.id,
    userEmail: session.user.email ?? "—",
    amountLabel: formatRubCurrency(parsed.data.amount),
    periodLabel: formatPayoutPeriods(result.shares),
    contractNumber
  }).catch((error) => {
    console.error("[telegram] payout request notification failed", { payoutId: result.payoutId, error });
  });

  return NextResponse.json(response, { status: 201 });
}
