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
}

export interface ParsedPayoutRequisites {
  recipientName: string;
  accountDetails: string;
  bankName: string;
  taxId: string;
  paypalEmail: string;
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

  return {
    recipientName,
    accountDetails,
    bankName,
    taxId,
    paypalEmail
  };
}

export function mapConfirmedToPayoutStatus(confirmed: boolean | null | undefined): AdminPayoutStatus {
  if (confirmed === true) return "PAID";
  if (confirmed === null) return "REJECTED";
  return "REQUESTED";
}

export async function listAdminPayoutRequests(prisma: any, limit = 200): Promise<AdminPayoutDetails[]> {
  const payouts = await prisma.payouts.findMany({
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

  return payouts.map((payout: any) => ({
    ...parsePayoutRequisites({
      recieverName: payout.recieverName,
      accountNumber: payout.accountNumber
    }),
    id: payout.id,
    amount: Number(payout.amount ?? 0),
    currency: "RUB",
    status: mapConfirmedToPayoutStatus(payout.confirmed),
    createdAt: (payout.createdAt ?? new Date()).toISOString(),
    updatedAt: (payout.createdAt ?? new Date()).toISOString(),
    processedAt: payout.confirmed === true || payout.confirmed === null
      ? (payout.createdAt ?? new Date()).toISOString()
      : null,
    user: {
      id: payout.user.id,
      name: payout.user.name,
      email: payout.user.email
    },
    method: "BANK_TRANSFER",
    comment: null
  }));
}
