import type { PrismaClient } from "@prisma/client";

// Accruals left behind by financial imports that were deleted before deletion removed
// their rows: the royalty lost its import link (ON DELETE SET NULL) but kept the ledger
// entry, so it showed up in wallet history as a real accrual.
const IMPORT_DESCRIPTION_PREFIX = "Royalty import";

export type OrphanAccrualSource = {
  source: string;
  rows: number;
  users: number;
  amount: number;
};

async function findOrphanRoyaltyIds(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.royalty_transactions.findMany({
    where: {
      financial_import_id: null,
      financial_import_row_id: null,
      balance_transactions: { some: { description: { startsWith: IMPORT_DESCRIPTION_PREFIX } } }
    },
    select: { id: true }
  });
  return rows.map((row) => row.id);
}

export async function listOrphanAccruals(prisma: PrismaClient): Promise<OrphanAccrualSource[]> {
  const ids = await findOrphanRoyaltyIds(prisma);
  if (ids.length === 0) return [];

  const entries = await prisma.balance_transactions.findMany({
    where: { royalty_transaction_id: { in: ids } },
    select: { user_id: true, amount: true, description: true }
  });

  const bySource = new Map<string, { rows: number; users: Set<string>; amount: number }>();
  for (const entry of entries) {
    const source = String(entry.description ?? "")
      .slice(IMPORT_DESCRIPTION_PREFIX.length)
      .trim() || "Без названия";
    const bucket = bySource.get(source) ?? { rows: 0, users: new Set<string>(), amount: 0 };
    bucket.rows += 1;
    bucket.users.add(entry.user_id);
    bucket.amount += Number(entry.amount);
    bySource.set(source, bucket);
  }

  return Array.from(bySource.entries())
    .map(([source, bucket]) => ({
      source,
      rows: bucket.rows,
      users: bucket.users.size,
      amount: Number(bucket.amount.toFixed(2))
    }))
    .sort((a, b) => b.rows - a.rows);
}

export async function cleanupOrphanAccruals(prisma: PrismaClient): Promise<{ royalties: number; ledgerEntries: number }> {
  const ids = await findOrphanRoyaltyIds(prisma);
  if (ids.length === 0) return { royalties: 0, ledgerEntries: 0 };

  return prisma.$transaction(async (tx) => {
    const ledger = await tx.balance_transactions.deleteMany({
      where: { royalty_transaction_id: { in: ids } }
    });
    const royalties = await tx.royalty_transactions.deleteMany({
      where: { id: { in: ids }, financial_import_id: null }
    });
    return { royalties: royalties.count, ledgerEntries: ledger.count };
  });
}
