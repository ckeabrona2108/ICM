import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

type PartnerCodeClient = Pick<PrismaClient, "partner_codes" | "partner_code_usages">;
type PartnerCodeTx = Prisma.TransactionClient;
type PartnerCodeRecord = Prisma.partner_codesGetPayload<{
  include: {
    allowedUser: { select: { id: true; email: true } };
    createdByAdmin: { select: { id: true; email: true } };
    usages: {
      include: {
        release: { select: { id: true; title: true } };
        user: { select: { id: true; email: true } };
      };
    };
  };
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeEmailDomain(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return null;
  return normalized.startsWith("@") ? normalized.slice(1) : normalized;
}

function extractEmailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export class PartnerCodeValidationError extends Error {}

export const partnerCodeUpsertSchema = z.object({
  code: z.string().trim().min(2).max(64),
  label: z.string().trim().max(120).optional().nullable(),
  active: z.boolean().optional().default(true),
  coversReleasePayment: z.boolean().optional().default(true),
  maxUses: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().trim().datetime().optional().nullable(),
  allowedUserId: z.string().trim().uuid().optional().nullable(),
  allowedEmailDomain: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
});

export const partnerCodePatchSchema = z.object({
  code: z.string().trim().min(2).max(64).optional(),
  label: z.string().trim().max(120).optional().nullable(),
  active: z.boolean().optional(),
  coversReleasePayment: z.boolean().optional(),
  maxUses: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().trim().datetime().optional().nullable(),
  allowedUserId: z.string().trim().uuid().optional().nullable(),
  allowedEmailDomain: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
});

export type PartnerCodeUpsertInput = z.infer<typeof partnerCodeUpsertSchema>;
export type PartnerCodePatchInput = z.infer<typeof partnerCodePatchSchema>;

export interface PartnerCodeListItem {
  id: string;
  code: string;
  label: string | null;
  active: boolean;
  coversReleasePayment: boolean;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  allowedUserId: string | null;
  allowedUserEmail: string | null;
  allowedEmailDomain: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByAdminId: string | null;
  createdByAdminEmail: string | null;
  usages: Array<{
    id: string;
    releaseId: string;
    releaseTitle: string | null;
    userId: string;
    userEmail: string | null;
    createdAt: string;
  }>;
}

export type PartnerCodeConsumeResult = {
  ok: true;
  partnerCodeId: string;
  code: string;
} | {
  ok: false;
  reason: "not_found" | "inactive" | "expired" | "limit_reached" | "forbidden";
  message: string;
};

function toNullableIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapPartnerCodeRecord(item: PartnerCodeRecord): PartnerCodeListItem {
  return {
    id: item.id,
    code: item.code,
    label: item.label,
    active: item.active,
    coversReleasePayment: item.coversReleasePayment,
    maxUses: item.maxUses,
    usedCount: item.usedCount,
    expiresAt: toNullableIso(item.expiresAt),
    allowedUserId: item.allowedUserId,
    allowedUserEmail: item.allowedUser?.email ?? null,
    allowedEmailDomain: item.allowedEmailDomain,
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    createdByAdminId: item.createdByAdminId,
    createdByAdminEmail: item.createdByAdmin?.email ?? null,
    usages: item.usages.map((usage) => ({
      id: usage.id,
      releaseId: usage.releaseId,
      releaseTitle: usage.release?.title ?? null,
      userId: usage.userId,
      userEmail: usage.user?.email ?? null,
      createdAt: usage.createdAt.toISOString()
    }))
  };
}

export async function listPartnerCodes(prisma: Pick<
  PrismaClient,
  "partner_codes"
>): Promise<PartnerCodeListItem[]> {
  const items = await prisma.partner_codes.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      allowedUser: {
        select: { id: true, email: true }
      },
      createdByAdmin: {
        select: { id: true, email: true }
      },
      usages: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          release: {
            select: { id: true, title: true }
          },
          user: {
            select: { id: true, email: true }
          }
        }
      }
    }
  });

  return items.map(mapPartnerCodeRecord);
}

function buildPartnerCodeData(
  input: PartnerCodeUpsertInput | PartnerCodePatchInput
): Prisma.partner_codesUncheckedCreateInput | Prisma.partner_codesUncheckedUpdateInput {
  const data: Prisma.partner_codesUncheckedCreateInput | Prisma.partner_codesUncheckedUpdateInput = {};

  if ("code" in input && typeof input.code === "string") {
    data.code = normalizeCode(input.code);
  }
  if ("label" in input) data.label = input.label?.trim() || null;
  if ("active" in input && typeof input.active === "boolean") data.active = input.active;
  if ("coversReleasePayment" in input && typeof input.coversReleasePayment === "boolean") {
    data.coversReleasePayment = input.coversReleasePayment;
  }
  if ("maxUses" in input) data.maxUses = input.maxUses ?? null;
  if ("expiresAt" in input) {
    data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  }
  if ("allowedUserId" in input) data.allowedUserId = input.allowedUserId?.trim() || null;
  if ("allowedEmailDomain" in input) {
    data.allowedEmailDomain = normalizeEmailDomain(input.allowedEmailDomain) ?? null;
  }
  if ("notes" in input) data.notes = input.notes?.trim() || null;

  return data;
}

export async function createPartnerCode(params: {
  prisma: Pick<PrismaClient, "partner_codes">;
  adminId: string;
  input: PartnerCodeUpsertInput;
}): Promise<PartnerCodeListItem> {
  const parsed = partnerCodeUpsertSchema.safeParse(params.input);
  if (!parsed.success) {
    throw new PartnerCodeValidationError(parsed.error.issues[0]?.message ?? "Invalid partner code payload");
  }

  const created = await params.prisma.partner_codes.create({
    data: {
      ...(buildPartnerCodeData(parsed.data) as Prisma.partner_codesUncheckedCreateInput),
      createdByAdminId: params.adminId
    },
    include: {
      allowedUser: { select: { id: true, email: true } },
      createdByAdmin: { select: { id: true, email: true } },
      usages: {
        include: {
          release: { select: { id: true, title: true } },
          user: { select: { id: true, email: true } }
        }
      }
    }
  });

  return mapPartnerCodeRecord(created);
}

export async function updatePartnerCode(params: {
  prisma: Pick<PrismaClient, "partner_codes">;
  id: string;
  input: PartnerCodePatchInput;
}): Promise<PartnerCodeListItem | null> {
  const parsed = partnerCodePatchSchema.safeParse(params.input);
  if (!parsed.success) {
    throw new PartnerCodeValidationError(parsed.error.issues[0]?.message ?? "Invalid partner code payload");
  }

  const existing = await params.prisma.partner_codes.findUnique({
    where: { id: params.id },
    select: { id: true }
  });
  if (!existing) return null;

  const updated = await params.prisma.partner_codes.update({
    where: { id: params.id },
    data: buildPartnerCodeData(parsed.data) as Prisma.partner_codesUncheckedUpdateInput,
    include: {
      allowedUser: { select: { id: true, email: true } },
      createdByAdmin: { select: { id: true, email: true } },
      usages: {
        include: {
          release: { select: { id: true, title: true } },
          user: { select: { id: true, email: true } }
        }
      }
    }
  });

  return mapPartnerCodeRecord(updated);
}

function validatePartnerCodeEligibility(params: {
  item: {
    id: string;
    code: string;
    active: boolean;
    coversReleasePayment: boolean;
    maxUses: number | null;
    usedCount: number;
    expiresAt: Date | null;
    allowedUserId: string | null;
    allowedEmailDomain: string | null;
  };
  userId: string;
  userEmail: string;
}): PartnerCodeConsumeResult {
  const now = Date.now();
  if (!params.item.active || !params.item.coversReleasePayment) {
    return {
      ok: false,
      reason: "inactive",
      message: "Партнёрский код недоступен."
    };
  }

  if (params.item.expiresAt && params.item.expiresAt.getTime() < now) {
    return {
      ok: false,
      reason: "expired",
      message: "Срок действия партнёрского кода истёк."
    };
  }

  if (
    typeof params.item.maxUses === "number" &&
    params.item.usedCount >= params.item.maxUses
  ) {
    return {
      ok: false,
      reason: "limit_reached",
      message: "Лимит использований партнёрского кода исчерпан."
    };
  }

  if (params.item.allowedUserId && params.item.allowedUserId !== params.userId) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Этот партнёрский код недоступен для вашего аккаунта."
    };
  }

  const allowedDomain = normalizeEmailDomain(params.item.allowedEmailDomain);
  if (allowedDomain) {
    const userDomain = extractEmailDomain(params.userEmail);
    if (!userDomain || userDomain !== allowedDomain) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Этот партнёрский код ограничен по домену email."
      };
    }
  }

  return {
    ok: true,
    partnerCodeId: params.item.id,
    code: params.item.code
  };
}

export async function consumePartnerCodeForRelease(params: {
  prisma: PartnerCodeClient | PartnerCodeTx;
  code: string;
  userId: string;
  userEmail: string;
  releaseId: string;
}): Promise<PartnerCodeConsumeResult> {
  return await checkPartnerCodeForReleaseInternal({
    ...params,
    code: normalizeCode(params.code),
    consume: true
  });
}

export async function checkPartnerCodeForRelease(params: {
  prisma: PartnerCodeClient | PartnerCodeTx;
  code: string;
  userId: string;
  userEmail: string;
  releaseId?: string;
}): Promise<PartnerCodeConsumeResult> {
  return await checkPartnerCodeForReleaseInternal({
    ...params,
    code: normalizeCode(params.code),
    consume: false
  });
}

async function checkPartnerCodeForReleaseInternal(params: {
  prisma: PartnerCodeClient | PartnerCodeTx;
  code: string;
  userId: string;
  userEmail: string;
  releaseId?: string;
  consume: boolean;
}): Promise<PartnerCodeConsumeResult> {
  const normalizedCode = params.code;
  if (!normalizedCode) {
    return {
      ok: false,
      reason: "not_found",
      message: "Партнёрский код не найден."
    };
  }

  const item = await params.prisma.partner_codes.findUnique({
    where: { code: normalizedCode },
    select: {
      id: true,
      code: true,
      active: true,
      coversReleasePayment: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      allowedUserId: true,
      allowedEmailDomain: true
    }
  });

  if (!item) {
    return {
      ok: false,
      reason: "not_found",
      message: "Партнёрский код не найден."
    };
  }

  const eligibility = validatePartnerCodeEligibility({
    item,
    userId: params.userId,
    userEmail: params.userEmail
  });
  if (!eligibility.ok) return eligibility;

  if (!params.consume) {
    return {
      ok: true,
      partnerCodeId: item.id,
      code: item.code
    };
  }

  const releaseId = params.releaseId?.trim();
  if (!releaseId) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Не удалось определить релиз для применения партнёрского кода."
    };
  }

  const existingUsage = await params.prisma.partner_code_usages.findFirst({
    where: {
      partnerCodeId: item.id,
      releaseId
    },
    select: { id: true }
  });

  if (existingUsage) {
    return {
      ok: true,
      partnerCodeId: item.id,
      code: item.code
    };
  }

  await params.prisma.partner_code_usages.create({
    data: {
      partnerCodeId: item.id,
      userId: params.userId,
      releaseId,
      codeSnapshot: item.code
    }
  });

  await params.prisma.partner_codes.update({
    where: { id: item.id },
    data: {
      usedCount: {
        increment: 1
      }
    }
  });

  return {
    ok: true,
    partnerCodeId: item.id,
    code: item.code
  };
}

export function readPartnerCodeFromRoles(roles: unknown): string | null {
  const root = asRecord(roles);
  const direct = typeof root?.releasePartnerCode === "string" ? root.releasePartnerCode.trim() : "";
  if (direct) return direct;
  const usage = asRecord(root?.paymentUsage);
  const usageCode = typeof usage?.partnerCode === "string" ? usage.partnerCode.trim() : "";
  if (usageCode) return usageCode;
  return null;
}
