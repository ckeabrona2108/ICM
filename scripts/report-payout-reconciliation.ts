import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function readArg(name: string): string | null {
  const direct = process.argv.find((arg) => arg === name);
  if (direct) return "true";
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

function databaseSummary() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const value = new URL(raw);
    return { host: value.hostname, database: value.pathname.slice(1), schema: value.searchParams.get("schema") };
  } catch {
    return null;
  }
}

async function main() {
  const limit = Math.max(1, Math.min(Number.parseInt(readArg("--limit") ?? "1000", 10) || 1000, 10_000));
  const outputRoot = readArg("--output") ?? path.join(process.cwd(), "tmp", "payout-reconciliation");
  const payouts = await prisma.payouts.findMany({
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, userId: true, amount: true, status: true, createdAt: true, paidAt: true, rejectedAt: true, requisites: true }
  });
  const paidIds = payouts.filter((item) => item.status === "PAID").map((item) => item.id);
  const debits = paidIds.length === 0 ? [] : await prisma.transaction.findMany({
    where: { payoutId: { in: paidIds } },
    select: { id: true, payoutId: true, userId: true, amount: true, type: true, status: true, createdAt: true }
  });
  const debitByPayout = new Map(debits.map((item) => [item.payoutId, item]));
  const issues = payouts.flatMap((payout) => {
    if (payout.status === "PAID" && !debitByPayout.has(payout.id)) return [{ kind: "paid_without_debit", payoutId: payout.id }];
    if (payout.status !== "PAID" && debitByPayout.has(payout.id)) return [{ kind: "non_paid_with_debit", payoutId: payout.id }];
    if (["REQUESTED", "PROCESSING"].includes(payout.status) && !payout.requisites) return [{ kind: "reserved_without_requisites", payoutId: payout.id }];
    return [];
  });
  const report = { createdAt: new Date().toISOString(), mode: "dry-run", database: databaseSummary(), scanned: payouts.length, paid: paidIds.length, linkedDebits: debits.length, issues, payouts, debits };
  await mkdir(outputRoot, { recursive: true });
  const outputPath = path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/gu, "-")}-dry-run.json`);
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode: "dry-run", scanned: report.scanned, issues: issues.length, outputPath }, null, 2));
}

main().catch((error) => {
  console.error("[payout-reconciliation] failed", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
