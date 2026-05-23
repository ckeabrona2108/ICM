// @ts-nocheck
import type { ReleaseStatus } from "@prisma/client";

export function canSaveDraftForStatus(status: ReleaseStatus): boolean {
  return status === "DRAFT" || status === "CHANGES_REQUIRED";
}

export function canDeleteDraftForStatus(status: ReleaseStatus): boolean {
  return status === "DRAFT";
}

export function canSaveDraft(params: {
  status: ReleaseStatus;
  isOwner: boolean;
}): { allowed: boolean; reason?: string } {
  if (!params.isOwner) {
    return {
      allowed: false,
      reason: "forbidden_owner"
    };
  }

  if (!canSaveDraftForStatus(params.status)) {
    return {
      allowed: false,
      reason: "forbidden_status"
    };
  }

  return { allowed: true };
}

export function canDeleteDraft(params: {
  status: ReleaseStatus;
  isOwner: boolean;
}): { allowed: boolean; reason?: string } {
  if (!params.isOwner) {
    return {
      allowed: false,
      reason: "forbidden_owner"
    };
  }

  if (!canDeleteDraftForStatus(params.status)) {
    return {
      allowed: false,
      reason: "forbidden_status"
    };
  }

  return { allowed: true };
}
