import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  grantSubscriptionFromConfirmedPayment,
  listSubscriptionRepairCandidates
} from "@/lib/subscription-payment-service";
import { getYooKassaPayment } from "@/lib/yookassa";

const prisma = new PrismaClient();

function readArg(name: string): string | null {
  const direct = process.argv.find((arg) => arg === name);
  if (direct) return "true";
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

function summarizeDatabaseUrl() {
  const raw = process.env.DATABASE_URL ?? "";
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    return {
      host: parsed.hostname,
      port: parsed.port || null,
      database: parsed.pathname.replace(/^\//u, "") || null,
      schema: parsed.searchParams.get("schema")
    };
  } catch {
    return null;
  }
}

async function buildSnapshot(orderIds: string[]) {
  const orders = await prisma.orders.findMany({
    where: { id: { in: orderIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      type: true,
      confirmed: true,
      payment_status: true,
      metadata: true,
      createdAt: true,
      completed_at: true
    }
  });

  const userIds = [...new Set(orders.map((order) => order.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      email: true,
      isSubscribed: true,
      subscribeLevel: true,
      expiresAt: true
    }
  });

  return { orders, users };
}

async function main() {
  const apply = readArg("--apply") === "true";
  const limit = Number.parseInt(readArg("--limit") ?? "50", 10);
  const outputRoot = readArg("--output") ?? path.join(process.cwd(), "tmp", "subscription-reconciliation");
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");

  const candidates = await listSubscriptionRepairCandidates({
    prisma,
    limit: Number.isFinite(limit) ? limit : 50,
    providerStatusResolver: async (providerPaymentId) => {
      const payment = await getYooKassaPayment(providerPaymentId);
      return payment.status;
    }
  });

  await mkdir(outputRoot, { recursive: true });

  const snapshot = await buildSnapshot(candidates.map((candidate) => candidate.orderId));
  const snapshotPath = path.join(outputRoot, `${timestamp}-${apply ? "apply" : "dry-run"}-snapshot.json`);
  await writeFile(
    snapshotPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        mode: apply ? "apply" : "dry-run",
        database: summarizeDatabaseUrl(),
        candidates,
        snapshot
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log(JSON.stringify({
      mode: "dry-run",
      candidates: candidates.length,
      snapshotPath,
      items: candidates
    }, null, 2));
    return;
  }

  const results = [] as Array<{
    orderId: string;
    action: string;
    result: Awaited<ReturnType<typeof grantSubscriptionFromConfirmedPayment>>;
  }>;

  for (const candidate of candidates) {
    const result = await grantSubscriptionFromConfirmedPayment({
      prisma,
      orderId: candidate.orderId,
      completedAt: new Date()
    });
    results.push({
      orderId: candidate.orderId,
      action: candidate.repairAction,
      result
    });
  }

  const resultPath = path.join(outputRoot, `${timestamp}-apply-results.json`);
  await writeFile(
    resultPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        database: summarizeDatabaseUrl(),
        snapshotPath,
        repaired: results.length,
        results
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({
    mode: "apply",
    repaired: results.length,
    snapshotPath,
    resultPath,
    results
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("[subscription-reconciliation] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
