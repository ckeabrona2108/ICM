import type { Prisma, PrismaClient } from "@prisma/client";

export async function createAdminLog(
  prisma: PrismaClient | Prisma.TransactionClient,
  params: {
    adminId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    comment?: string;
    payload?: Prisma.InputJsonValue;
  }
) {
  const mergedPayload: Record<string, unknown> = {};
  if (params.oldValue !== undefined) mergedPayload.oldValue = params.oldValue;
  if (params.newValue !== undefined) mergedPayload.newValue = params.newValue;
  if (params.comment !== undefined) mergedPayload.comment = params.comment;
  if (params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)) {
    Object.assign(mergedPayload, params.payload as Record<string, unknown>);
  }

  await prisma.adminLog.create({
    data: {
      adminId: params.adminId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      payload: mergedPayload as Prisma.InputJsonValue
    }
  });
}

