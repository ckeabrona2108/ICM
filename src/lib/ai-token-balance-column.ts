import type { PrismaClient } from "@prisma/client";

type QueryRawCapableClient = Pick<PrismaClient, "$queryRaw">;

export async function hasUserAiTokenBalanceColumn(prisma: QueryRawCapableClient): Promise<boolean> {
  if (typeof prisma.$queryRaw !== "function") {
    return true;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'icecream'
          AND table_name = 'user'
          AND lower(column_name) = 'aitokenbalance'
      ) AS "exists"
    `;

    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}
