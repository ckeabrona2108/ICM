import type { verification_status } from "@prisma/client";

import { mapReleaseStatusToSection } from "@/lib/release-counts";

interface DraftAccessParams {
  status: verification_status;
  confirmed?: boolean | null;
  upc?: string | null;
  roles?: unknown;
  isOwner: boolean;
}

function readSubmittedToModeration(roles: unknown): boolean {
  return (
    Boolean(roles) &&
    typeof roles === "object" &&
    !Array.isArray(roles) &&
    (roles as Record<string, unknown>).submittedToModeration === true
  );
}

function resolveReleaseSection(params: Omit<DraftAccessParams, "isOwner">) {
  return mapReleaseStatusToSection(
    params.status,
    params.confirmed,
    readSubmittedToModeration(params.roles),
    {
      upc: params.upc,
      roles: params.roles
    }
  );
}

export function canSaveDraftForStatus(params: Omit<DraftAccessParams, "isOwner">): boolean {
  const section = resolveReleaseSection(params);
  return section === "draft" || section === "changes_required";
}

export function canDeleteDraftForStatus(params: Omit<DraftAccessParams, "isOwner">): boolean {
  return resolveReleaseSection(params) === "draft";
}

export function canSaveDraft(params: DraftAccessParams): { allowed: boolean; reason?: string } {
  if (!params.isOwner) {
    return {
      allowed: false,
      reason: "forbidden_owner"
    };
  }

  if (!canSaveDraftForStatus(params)) {
    return {
      allowed: false,
      reason: "forbidden_status"
    };
  }

  return { allowed: true };
}

export function canDeleteDraft(params: DraftAccessParams): { allowed: boolean; reason?: string } {
  if (!params.isOwner) {
    return {
      allowed: false,
      reason: "forbidden_owner"
    };
  }

  if (!canDeleteDraftForStatus(params)) {
    return {
      allowed: false,
      reason: "forbidden_status"
    };
  }

  return { allowed: true };
}
