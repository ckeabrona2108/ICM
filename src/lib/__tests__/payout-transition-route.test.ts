import assert from "node:assert/strict";
import test from "node:test";
import { handlePayoutTransition } from "@/lib/payout-transition-route";

type Status = "REQUESTED" | "PROCESSING" | "PAID" | "REJECTED";
function harness(initial: Status | null = "REQUESTED", failDebit = false) {
  let row = initial ? { id: "p1", userId: "u1", amount: 3000, status: initial } : null;
  let debits = 0;
  let notices = 0;
  let debitAttempts = 0;
  let lastDebitData: any = null;
  let queue = Promise.resolve();
  const prisma = { $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const run = queue.then(async () => {
      const before = row && { ...row };
      try {
        return await callback({
          payouts: {
            updateMany: async ({ where, data }: any) => {
              if (!row || !where.status.in.includes(row.status)) return { count: 0 };
              row = { ...row, ...data }; return { count: 1 };
            },
            findUnique: async () => row
          },
          transaction: { create: async ({ data }: any) => {
            debitAttempts++;
            if (failDebit) throw new Error("ledger unavailable");
            lastDebitData = data;
            debits++;
          } }
        });
      } catch (error) { row = before; throw error; }
    });
    queue = run.then(() => undefined, () => undefined);
    return run;
  } };
  return {
    run: (status: Exclude<Status, "REQUESTED">, session: any = { user: { role: "ADMIN" } }) => handlePayoutTransition({
      prisma: prisma as never, id: "p1", status, session, notify: (async () => { notices++; }) as never
    }),
    state: () => ({ status: row?.status, debits, notices, debitAttempts, lastDebitData })
  };
}

test("payout routes enforce authentication, role, and existence", async () => {
  const h = harness(null);
  assert.equal((await h.run("PAID", null)).status, 401);
  assert.equal((await h.run("PAID", { user: { role: "ARTIST" } })).status, 403);
  assert.equal((await h.run("PAID")).status, 404);
});
test("simultaneous PAID calls debit and notify exactly once", async () => {
  const h = harness();
  assert.deepEqual((await Promise.all([h.run("PAID"), h.run("PAID")])).map(r => r.status), [200, 200]);
  const state = h.state();
  assert.equal(state.status, "PAID");
  assert.equal(state.debits, 1);
  assert.equal(state.notices, 1);
  assert.equal(state.debitAttempts, 1);
  assert.equal("payoutId" in state.lastDebitData, false);
});
test("paid versus reject preserves whichever terminal transition wins", async () => {
  for (const first of ["PAID", "REJECTED"] as const) {
    const h = harness();
    const second = first === "PAID" ? "REJECTED" : "PAID";
    assert.deepEqual((await Promise.all([h.run(first), h.run(second)])).map(r => r.status), [200, 409]);
    const state = h.state();
    assert.equal(state.status, first);
    assert.equal(state.debits, first === "PAID" ? 1 : 0);
    assert.equal(state.notices, 1);
    assert.equal(state.debitAttempts, first === "PAID" ? 1 : 0);
    assert.equal((await h.run("PROCESSING")).status, 409);
  }
});
test("processing followed by paid completes; ledger failure rolls back status", async () => {
  const h = harness();
  assert.equal((await h.run("PROCESSING")).status, 200);
  assert.equal((await h.run("PAID")).status, 200);
  const failing = harness("REQUESTED", true);
  await assert.rejects(failing.run("PAID"), /ledger unavailable/);
  const state = failing.state();
  assert.equal(state.status, "REQUESTED");
  assert.equal(state.debits, 0);
  assert.equal(state.notices, 0);
  assert.equal(state.debitAttempts, 1);
});
