import type { Prisma, PrismaClient } from "@prisma/client";

type AdminLogDelegate = {
  create: (args: {
    data: {
      adminId: string;
      action: string;
      targetType: string;
      targetId: string | null;
      payload: Prisma.InputJsonValue;
    };
  }) => Promise<unknown>;
};

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
  const adminLogRepo = (prisma as unknown as { adminLog?: AdminLogDelegate }).adminLog;

  if (typeof adminLogRepo?.create !== "function") {
    return;
  }

  const mergedPayload: Record<string, unknown> = {};
  if (params.oldValue !== undefined) mergedPayload.oldValue = params.oldValue;
  if (params.newValue !== undefined) mergedPayload.newValue = params.newValue;
  if (params.comment !== undefined) mergedPayload.comment = params.comment;
  if (params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)) {
    Object.assign(mergedPayload, params.payload as Record<string, unknown>);
  }

  try {
    await adminLogRepo.create({
      data: {
        adminId: params.adminId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        payload: mergedPayload as Prisma.InputJsonValue
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (
      message.includes("adminlog") ||
      message.includes("admin_log") ||
      message.includes("does not exist") ||
      message.includes("unknown")
    ) {
      return;
    }
    throw error;
  }
}
