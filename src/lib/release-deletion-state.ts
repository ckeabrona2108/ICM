import type { Prisma } from "@prisma/client";

export type ReleaseDeletionStatus = "requested" | "deleted" | "restored";

export interface ReleaseDeletionState {
  status: ReleaseDeletionStatus;
  comment?: string;
  requestedAt?: string;
  requestedByUserId?: string;
  decidedAt?: string;
  decidedByAdminId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeDeletionStatus(value: unknown): ReleaseDeletionStatus | null {
  const status = asString(value);
  if (status === "requested" || status === "deleted" || status === "restored") return status;
  return null;
}

export function getReleaseDeletionState(roles: unknown): ReleaseDeletionState | null {
  const root = asRecord(roles);
  const deletionRequest = asRecord(root?.deletionRequest);
  const status = normalizeDeletionStatus(deletionRequest?.status);
  if (!deletionRequest || !status) return null;

  const state: ReleaseDeletionState = { status };
  const comment = asString(deletionRequest.comment);
  const requestedAt = asString(deletionRequest.requestedAt);
  const requestedByUserId = asString(deletionRequest.requestedByUserId);
  const decidedAt = asString(deletionRequest.decidedAt);
  const decidedByAdminId = asString(deletionRequest.decidedByAdminId);
  if (comment) state.comment = comment;
  if (requestedAt) state.requestedAt = requestedAt;
  if (requestedByUserId) state.requestedByUserId = requestedByUserId;
  if (decidedAt) state.decidedAt = decidedAt;
  if (decidedByAdminId) state.decidedByAdminId = decidedByAdminId;
  return state;
}

export function isReleaseHiddenFromCabinet(roles: unknown): boolean {
  const deletion = getReleaseDeletionState(roles);
  return deletion?.status === "requested" || deletion?.status === "deleted";
}

function cloneRoles(roles: unknown): Record<string, unknown> {
  const root = asRecord(roles);
  return root ? structuredClone(root) : {};
}

export function withReleaseDeletionRequested(
  roles: unknown,
  params: {
    userId: string;
    comment: string;
    requestedAt?: Date;
  }
): Prisma.InputJsonValue {
  const next = cloneRoles(roles);
  next.deletionRequest = {
    status: "requested",
    comment: params.comment.trim(),
    requestedAt: (params.requestedAt ?? new Date()).toISOString(),
    requestedByUserId: params.userId
  };
  return next as Prisma.InputJsonValue;
}

export function withReleaseDeletionApproved(
  roles: unknown,
  params: {
    adminId: string;
    decidedAt?: Date;
  }
): Prisma.InputJsonValue {
  const next = cloneRoles(roles);
  const current = getReleaseDeletionState(next);
  next.deletionRequest = {
    ...(current ?? {}),
    status: "deleted",
    decidedAt: (params.decidedAt ?? new Date()).toISOString(),
    decidedByAdminId: params.adminId
  };
  return next as Prisma.InputJsonValue;
}

export function withReleaseDeletionRestored(
  roles: unknown,
  params: {
    adminId: string;
    decidedAt?: Date;
  }
): Prisma.InputJsonValue {
  const next = cloneRoles(roles);
  const current = getReleaseDeletionState(next);
  next.deletionRequest = {
    ...(current ?? {}),
    status: "restored",
    decidedAt: (params.decidedAt ?? new Date()).toISOString(),
    decidedByAdminId: params.adminId
  };
  return next as Prisma.InputJsonValue;
}
