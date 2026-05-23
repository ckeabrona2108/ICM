import type { AdminPayoutStatus } from "@/lib/admin-payouts-service";

export function computeAvailableToWithdraw(input: {
  agreedBalance: number;
  pendingPayout: number;
}): number {
  const agreed = Number.isFinite(input.agreedBalance) ? input.agreedBalance : 0;
  const pending = Number.isFinite(input.pendingPayout) ? input.pendingPayout : 0;
  return Math.max(0, agreed - pending);
}

export function canMoveToProcessing(status: AdminPayoutStatus): boolean {
  return status === "REQUESTED";
}

export function canMoveToPaid(status: AdminPayoutStatus): boolean {
  return status === "REQUESTED" || status === "PROCESSING";
}

export function canMoveToRejected(status: AdminPayoutStatus): boolean {
  return status === "REQUESTED" || status === "PROCESSING";
}
