import { PayoutRequestStatus } from "@prisma/client";

export function computeAvailableToWithdraw(input: {
  agreedBalance: number;
  pendingPayout: number;
}): number {
  const agreed = Number.isFinite(input.agreedBalance) ? input.agreedBalance : 0;
  const pending = Number.isFinite(input.pendingPayout) ? input.pendingPayout : 0;
  return Math.max(0, agreed - pending);
}

export function canMoveToProcessing(status: PayoutRequestStatus): boolean {
  return status === PayoutRequestStatus.REQUESTED;
}

export function canMoveToPaid(status: PayoutRequestStatus): boolean {
  return (
    status === PayoutRequestStatus.REQUESTED || status === PayoutRequestStatus.PROCESSING
  );
}

export function canMoveToRejected(status: PayoutRequestStatus): boolean {
  return (
    status === PayoutRequestStatus.REQUESTED || status === PayoutRequestStatus.PROCESSING
  );
}

