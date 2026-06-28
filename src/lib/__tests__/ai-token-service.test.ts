/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustAiTokensByAdmin,
  buyAiTokensInTestMode,
  listAiTokenTransactions,
  listAiTokenPackages,
  spendAiTokensForGeneration
} from "@/lib/ai-token-service";

test("token catalog includes the bonus tiers and merges fallback packages", async () => {
  const prisma = {
    ai_token_packages: {
      findMany: async () => [
        {
          id: "pkg_1",
          code: "starter",
          name: "Starter",
          token_amount: 1000,
          bonus_tokens: 0,
          price_rub: 500,
          active: true
        }
      ]
    }
  } as any;

  const packages = await listAiTokenPackages(prisma);
  assert.deepEqual(
    packages.map((item) => item.code),
    ["starter", "creator", "pro_creator", "studio", "mega_studio", "ultra_studio"]
  );
  assert.equal(packages.find((item) => item.code === "creator")?.bonusTokens, 100);
  assert.equal(packages.find((item) => item.code === "mega_studio")?.priceRub, 7500);
});

test("test top up credits balance and writes a topup transaction", async () => {
  let balance = 250;
  const transactionCreates: any[] = [];
  const prisma = {
    ai_token_packages: {
      findMany: async () => [
        {
          id: "pkg_1",
          code: "starter",
          name: "Starter",
          token_amount: 1000,
          bonus_tokens: 0,
          price_rub: 500,
          active: true
        }
      ]
    },
    user: {
      findUnique: async () => ({ id: "user_1", aiTokenBalance: balance }),
      update: async ({ data }: any) => {
        balance += data.aiTokenBalance.increment;
        return { aiTokenBalance: balance };
      },
      updateMany: async () => ({ count: 0 })
    },
    ai_token_transactions: {
      create: async ({ data }: any) => {
        transactionCreates.push(data);
        return { id: "tx_1" };
      }
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        ai_token_packages: prisma.ai_token_packages,
        user: prisma.user,
        ai_token_transactions: prisma.ai_token_transactions
      })
  } as any;

  const result = await buyAiTokensInTestMode({
    prisma,
    userId: "user_1",
    packageCode: "starter"
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.newBalance, 1250);
  assert.equal(balance, 1250);
  assert.equal(transactionCreates[0].type, "topup");
  assert.equal(transactionCreates[0].description, "Тестовое пополнение пакета Starter");
});

test("test top up credits bonus tokens when package includes them", async () => {
  let balance = 0;
  const transactionCreates: any[] = [];
  const prisma = {
    ai_token_packages: {
      findMany: async () => [
        {
          id: "pkg_1",
          code: "starter",
          name: "Starter",
          token_amount: 1000,
          bonus_tokens: 0,
          price_rub: 500,
          active: true
        }
      ]
    },
    user: {
      findUnique: async () => ({ id: "user_1", aiTokenBalance: balance }),
      update: async ({ data }: any) => {
        balance += data.aiTokenBalance.increment;
        return { aiTokenBalance: balance };
      },
      updateMany: async () => ({ count: 0 })
    },
    ai_token_transactions: {
      create: async ({ data }: any) => {
        transactionCreates.push(data);
        return { id: "tx_1" };
      }
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        ai_token_packages: prisma.ai_token_packages,
        user: prisma.user,
        ai_token_transactions: prisma.ai_token_transactions
      })
  } as any;

  const result = await buyAiTokensInTestMode({
    prisma,
    userId: "user_1",
    packageCode: "creator"
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.newBalance, 2600);
  assert.equal(balance, 2600);
  assert.equal(transactionCreates[0].amount_tokens, 2600);
  assert.match(transactionCreates[0].description, /100 бонусных токенов/);
});

test("test top up works without aiTokenBalance column by using the transaction ledger", async () => {
  const transactionCreates: any[] = [];
  const ledgerRows: any[] = [];
  const prisma = {
    ai_token_packages: {
      findMany: async () => [
        {
          id: "pkg_1",
          code: "starter",
          name: "Starter",
          token_amount: 1000,
          bonus_tokens: 0,
          price_rub: 500,
          active: true
        }
      ]
    },
    user: {
      findUnique: async () => ({ id: "user_1" })
    },
    ai_token_transactions: {
      findMany: async () => ledgerRows,
      create: async ({ data }: any) => {
        transactionCreates.push(data);
        ledgerRows.unshift({
          balance_after: data.balance_after
        });
        return { id: "tx_ledger_1" };
      }
    },
    $queryRaw: async () => [{ exists: false }],
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        ai_token_packages: prisma.ai_token_packages,
        user: prisma.user,
        ai_token_transactions: prisma.ai_token_transactions,
        $queryRaw: prisma.$queryRaw
      })
  } as any;

  const result = await buyAiTokensInTestMode({
    prisma,
    userId: "user_1",
    packageCode: "starter"
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.newBalance, 1000);
  assert.equal(transactionCreates[0].balance_after, 1000);
  assert.equal(transactionCreates[0].type, "topup");
});

test("admin adjustment can debit balance and blocks overdraft", async () => {
  let balance = 500;
  const transactionCreates: any[] = [];
  const prisma = {
    user: {
      findUnique: async () => ({ id: "user_1", aiTokenBalance: balance }),
      update: async ({ data }: any) => {
        if (data.aiTokenBalance?.increment) {
          balance += data.aiTokenBalance.increment;
        }
        return { aiTokenBalance: balance };
      },
      updateMany: async ({ data, where }: any) => {
        if (where.aiTokenBalance?.gte && balance < where.aiTokenBalance.gte) {
          return { count: 0 };
        }
        if (data.aiTokenBalance?.decrement) {
          balance -= data.aiTokenBalance.decrement;
        }
        return { count: 1 };
      }
    },
    ai_token_transactions: {
      create: async ({ data }: any) => {
        transactionCreates.push(data);
        return { id: "tx_2" };
      }
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        user: prisma.user,
        ai_token_transactions: prisma.ai_token_transactions
      })
  } as any;

  const debit = await adjustAiTokensByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    amount: -200,
    reason: "Manual correction"
  });

  assert.equal(debit.ok, true);
  if (!debit.ok) return;
  assert.equal(debit.newBalance, 300);
  assert.equal(transactionCreates[0].type, "admin_adjustment");
  assert.equal(transactionCreates[0].amount_tokens, -200);

  const overdraft = await adjustAiTokensByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    amount: -1000,
    reason: "Too much"
  });

  assert.equal(overdraft.ok, false);
  if (overdraft.ok) return;
  assert.match(overdraft.error, /Нельзя списать/);
});

test("admin adjustment still records a transaction when optional columns are missing", async () => {
  let balance = 200;
  const createdPayloads: any[] = [];
  const prisma = {
    user: {
      findUnique: async () => ({ id: "user_1", aiTokenBalance: balance }),
      update: async ({ data }: any) => {
        if (data.aiTokenBalance?.increment) {
          balance += data.aiTokenBalance.increment;
        }
        return { aiTokenBalance: balance };
      },
      updateMany: async ({ data }: any) => {
        if (data.aiTokenBalance?.decrement) {
          balance -= data.aiTokenBalance.decrement;
        }
        return { count: 1 };
      }
    },
    ai_token_transactions: {
      findMany: async () => [],
      create: async ({ data }: any) => {
        createdPayloads.push(data);
        return { id: "tx_fallback" };
      }
    },
    $queryRaw: async (strings: TemplateStringsArray) => {
      const query = String(strings[0]);
      if (query.includes("table_name = 'user'")) {
        return [{ exists: true }];
      }
      if (query.includes("table_name = 'ai_token_transactions'")) {
        return [];
      }
      return [];
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        user: prisma.user,
        ai_token_transactions: prisma.ai_token_transactions,
        $queryRaw: prisma.$queryRaw
      })
  } as any;

  const result = await adjustAiTokensByAdmin({
    prisma,
    adminId: "admin_1",
    userId: "user_1",
    amount: 100,
    reason: "Fallback test"
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.newBalance, 300);
  assert.equal(createdPayloads[0].description, undefined);
  assert.equal(createdPayloads[0].metadata, undefined);
});

test("generation spend debits balance and records a generation transaction", async () => {
  let balance = 750;
  const transactionCreates: any[] = [];
  const prisma = {
    user: {
      findUnique: async () => ({ id: "user_1", aiTokenBalance: balance }),
      update: async ({ data }: any) => {
        if (data.aiTokenBalance?.increment) {
          balance += data.aiTokenBalance.increment;
        }
        return { aiTokenBalance: balance };
      },
      updateMany: async ({ data, where }: any) => {
        if (where.aiTokenBalance?.gte && balance < where.aiTokenBalance.gte) {
          return { count: 0 };
        }
        if (data.aiTokenBalance?.decrement) {
          balance -= data.aiTokenBalance.decrement;
        }
        return { count: 1 };
      }
    },
    ai_token_transactions: {
      create: async ({ data }: any) => {
        transactionCreates.push(data);
        return { id: "gen_tx_1" };
      }
    },
    $queryRaw: async (strings: TemplateStringsArray) => {
      const query = String(strings[0]);
      if (query.includes("information_schema.columns") && query.includes("aitokenbalance")) {
        return [{ exists: true }];
      }
      if (query.includes("information_schema.columns") && query.includes("generation_id")) {
        return [{ column_name: "generation_id" }];
      }
      return [];
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        user: prisma.user,
        ai_token_transactions: prisma.ai_token_transactions,
        $queryRaw: prisma.$queryRaw
      })
  } as any;

  const result = await spendAiTokensForGeneration({
    prisma,
    userId: "user_1",
    amount: 120,
    generationId: "gen_1",
    section: "video",
    modelCode: "bytedance/seedance-2.0/text-to-video",
    modelName: "Seedance 2.0",
    prompt: "Create a cinematic teaser"
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.newBalance, 630);
  assert.equal(balance, 630);
  assert.equal(transactionCreates[0].type, "generation");
  assert.equal(transactionCreates[0].amount_tokens, -120);
  assert.equal(transactionCreates[0].generation_id, "gen_1");
});

test("history loader maps token transaction rows", async () => {
  const prisma = {
    ai_token_transactions: {
      findMany: async () => [
        {
          id: "tx_1",
          user_id: "user_1",
          package_code: "starter",
          type: "topup",
          amount_tokens: 1000,
          amount_rub: 99,
          balance_after: 1250,
          description: "Тестовое пополнение пакета Starter",
          created_at: new Date("2026-06-21T15:00:00.000Z")
        }
      ]
    }
  } as any;

  const transactions = await listAiTokenTransactions(prisma, "user_1", 10);

  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].balanceAfter, 1250);
  assert.equal(transactions[0].description, "Тестовое пополнение пакета Starter");
});
