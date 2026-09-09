import { isAnyPrismaColumnMissingError } from "@/lib/prisma-errors";

export interface AdminPayoutUserInfo {
  id: string;
  name: string;
  email: string;
}

export type AdminPayoutStatus = "REQUESTED" | "PROCESSING" | "PAID" | "REJECTED";
export type AdminPayoutMethod = "BANK_TRANSFER";

export interface AdminPayoutDetails {
  id: string;
  amount: number;
  currency: string;
  status: AdminPayoutStatus;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  user: AdminPayoutUserInfo;
  recipientName: string;
  method: AdminPayoutMethod;
  accountDetails: string;
  bankName: string;
  taxId: string;
  paypalEmail: string;
  comment: string | null;
  payoutWindowLabel: string | null;
  payoutPeriodLabel: string | null;
}

export interface ParsedPayoutRequisites {
  recipientName: string;
  accountDetails: string;
  bankName: string;
  taxId: string;
  paypalEmail: string;
  payoutWindowLabel: string | null;
  payoutPeriodLabel: string | null;
}

export function parsePayoutRequisites(
  input: Record<string, unknown> | null | undefined
): ParsedPayoutRequisites {
  const source = input ?? {};
  const recipientName = String(source.recipientName ?? source.recieverName ?? "").trim();
  const accountDetails = String(source.accountDetails ?? source.accountNumber ?? "").trim();
  const bankName = String(source.bankName ?? "").trim();
  const taxId = String(source.taxId ?? "").trim();
  const paypalEmail = String(source.paypalEmail ?? "").trim();
  const payoutWindow = source.payoutWindow && typeof source.payoutWindow === "object"
    ? source.payoutWindow as Record<string, unknown>
    : null;

  return {
    recipientName,
    accountDetails,
    bankName,
    taxId,
    paypalEmail,
    payoutWindowLabel: payoutWindow ? String(payoutWindow.label ?? "").trim() || null : null,
    payoutPeriodLabel: payoutWindow ? String(payoutWindow.periodLabel ?? "").trim() || null : null
  };
}

export function mapConfirmedToPayoutStatus(confirmed: boolean | null | undefined): AdminPayoutStatus {
  if (confirmed === true) return "PAID";
  if (confirmed === null) return "REJECTED";
  return "REQUESTED";
}

export function normalizePayoutStatus(
  status: string | null | undefined,
  confirmed: boolean | null | undefined
): AdminPayoutStatus {
  if (status === "REQUESTED" || status === "PROCESSING" || status === "PAID" || status === "REJECTED") {
    return status;
  }
  return mapConfirmedToPayoutStatus(confirmed);
}

const MODERN_PAYOUT_COLUMNS = [
  "payouts.updatedAt",
  "updatedAt",
  "payouts.processedAt",
  "processedAt",
  "payouts.status",
  "status",
  "payouts.method",
  "method",
  "payouts.requisites",
  "requisites"
];

async function findAdminPayouts(prisma: any, limit: number) {
  try {
    return await prisma.payouts.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        amount: true,
        status: true,
        confirmed: true,
        createdAt: true,
        updatedAt: true,
        processedAt: true,
        method: true,
        requisites: true,
        recieverName: true,
        accountNumber: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  } catch (error) {
    if (!isAnyPrismaColumnMissingError(error, MODERN_PAYOUT_COLUMNS)) {
      throw error;
    }

    return prisma.payouts.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        amount: true,
        confirmed: true,
        createdAt: true,
        recieverName: true,
        accountNumber: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }
}

export async function listAdminPayoutRequests(prisma: any, limit = 200): Promise<AdminPayoutDetails[]> {
  const payouts = await findAdminPayouts(prisma, limit);

  return payouts.map((payout: any) => ({
    ...parsePayoutRequisites(
      payout.requisites ?? {
        recieverName: payout.recieverName,
        accountNumber: payout.accountNumber
      }
    ),
    id: payout.id,
    amount: Number(payout.amount ?? 0),
    currency: "RUB",
    status: normalizePayoutStatus(payout.status, payout.confirmed),
    createdAt: (payout.createdAt ?? new Date()).toISOString(),
    updatedAt: (payout.updatedAt ?? payout.createdAt ?? new Date()).toISOString(),
    processedAt: payout.processedAt?.toISOString() ?? null,
    user: {
      id: payout.user.id,
      name: payout.user.name,
      email: payout.user.email
    },
    method: payout.method ?? "BANK_TRANSFER",
    comment: null
  }));
}
