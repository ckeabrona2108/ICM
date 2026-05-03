import { PayoutMethod, PayoutRequestStatus, type PrismaClient } from "@prisma/client";

export interface AdminPayoutUserInfo {
  id: string;
  name: string;
  email: string;
}

export interface AdminPayoutDetails {
  id: string;
  amount: number;
  currency: string;
  status: PayoutRequestStatus;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  user: AdminPayoutUserInfo;
  recipientName: string;
  method: PayoutMethod;
  accountDetails: string;
  bankName: string;
  taxId: string;
  paypalEmail: string;
  comment: string | null;
}

interface ParsedPayoutRequisites {
  recipientName: string;
  accountDetails: string;
  bankName: string;
  taxId: string;
  paypalEmail: string;
}

function getStringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

export function parsePayoutRequisites(raw: unknown): ParsedPayoutRequisites {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      recipientName: "",
      accountDetails: "",
      bankName: "",
      taxId: "",
      paypalEmail: ""
    };
  }

  const data = raw as Record<string, unknown>;
  const accountDetails = getStringField(data, "accountDetails") || getStringField(data, "accountNumber");

  return {
    recipientName: getStringField(data, "recipientName"),
    accountDetails,
    bankName: getStringField(data, "bankName"),
    taxId: getStringField(data, "taxId"),
    paypalEmail: getStringField(data, "paypalEmail")
  };
}

export async function listAdminPayoutRequests(
  prisma: PrismaClient,
  limit = 200
): Promise<AdminPayoutDetails[]> {
  const payouts = await prisma.payoutRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  return payouts.map((payout) => {
    const requisites = parsePayoutRequisites(payout.requisites);
    return {
      id: payout.id,
      amount: Number(payout.amount),
      currency: payout.currency,
      status: payout.status,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString(),
      processedAt: payout.processedAt?.toISOString() ?? null,
      user: {
        id: payout.user.id,
        name: payout.user.name,
        email: payout.user.email
      },
      recipientName: requisites.recipientName,
      method: payout.method,
      accountDetails: requisites.accountDetails,
      bankName: requisites.bankName,
      taxId: requisites.taxId,
      paypalEmail: requisites.paypalEmail,
      comment: payout.comment
    } satisfies AdminPayoutDetails;
  });
}
