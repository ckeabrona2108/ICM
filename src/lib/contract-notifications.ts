import type { PrismaClient } from "@prisma/client";

import { deliverUserNotificationSafely, type UserNotificationEvent } from "@/lib/notification-delivery-service";

// What the artist hears when an admin reviews their licence contract: welcome on approval, the
// reason on rejection. Both go to the cabinet bell, VK, Telegram and email ("account_" kinds).

export const CONTRACT_APPROVED_KIND = "account_contract_approved";
export const CONTRACT_REJECTED_KIND = "account_contract_rejected";

function pluralReleases(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "релиз";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "релиза";
  return "релизов";
}

export function buildContractApprovedNotification(params: {
  userId: string;
  verificationId: string;
  contractNumber: number | null;
  movedReleaseCount: number;
}): UserNotificationEvent {
  const number = params.contractNumber ? ` № ${params.contractNumber}` : "";
  const moved = params.movedReleaseCount > 0
    ? ` ${params.movedReleaseCount} ${pluralReleases(params.movedReleaseCount)}, ${params.movedReleaseCount === 1 ? "который ждал" : "которые ждали"} договора, уже на модерации.`
    : "";
  return {
    id: `contract-approved-${params.verificationId}`,
    userId: params.userId,
    kind: CONTRACT_APPROVED_KIND,
    title: "Договор принят — добро пожаловать в ICECREAMMUSIC!",
    message: `Лицензионный договор${number} подтверждён. Теперь можно отправлять релизы на площадки и выводить заработанные деньги.${moved}`,
    href: params.movedReleaseCount > 0 ? "/dashboard/moderation" : "/dashboard/releases/new",
    emailCta: true,
    resetReadState: true
  };
}

export function buildContractRejectedNotification(params: {
  userId: string;
  verificationId: string;
  reason: string;
  /** The contract had been approved and is now cancelled. */
  wasApproved: boolean;
  movedReleaseCount: number;
}): UserNotificationEvent {
  const moved = params.movedReleaseCount > 0
    ? ` ${params.movedReleaseCount} ${pluralReleases(params.movedReleaseCount)} ${params.movedReleaseCount === 1 ? "возвращён" : "возвращены"} на доработку до нового договора.`
    : "";
  return {
    // A contract can be rejected, signed again and rejected again: each review is its own message.
    id: `contract-rejected-${params.verificationId}-${Date.now()}`,
    userId: params.userId,
    kind: CONTRACT_REJECTED_KIND,
    title: params.wasApproved ? "Договор аннулирован" : "Договор не принят",
    message: `Причина: ${params.reason.trim()}. Откройте кабинет, исправьте данные и подпишите договор заново.${moved}`,
    // The cabinet opens the contract window by itself while the contract is rejected.
    href: "/dashboard",
    emailCta: true,
    resetReadState: true
  };
}

type VerificationLookup = { verification: { findUnique: (args: unknown) => Promise<unknown> } };

/** Owner and current status of a verification, read before and after the admin's review. */
export async function readVerificationOwner(
  prisma: PrismaClient,
  verificationId: string
): Promise<{ userId: string; status: string } | null> {
  try {
    const row = (await (prisma as unknown as VerificationLookup).verification.findUnique({
      where: { id: verificationId },
      select: { userId: true, status: true }
    })) as { userId?: unknown; status?: unknown } | null;
    if (!row?.userId) return null;
    return { userId: String(row.userId), status: String(row.status ?? "").toLowerCase() };
  } catch (error) {
    console.error("[contract-notifications] verification lookup failed", { verificationId, error });
    return null;
  }
}

export async function notifyArtistContractReviewed(
  prisma: PrismaClient,
  event: UserNotificationEvent
): Promise<void> {
  await deliverUserNotificationSafely(prisma, event);
}
