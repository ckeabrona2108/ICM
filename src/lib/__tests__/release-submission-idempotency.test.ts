import assert from "node:assert/strict";
import test from "node:test";

import { executeIdempotentSubmission } from "@/lib/release-submission-idempotency";

function harness() {
  const receipts = new Map<string, { request_hash: string; response_status: number; response_body: unknown }>();
  let executions = 0;
  const tx = {
    $executeRaw: async () => 1,
    release_submission_requests: {
      findUnique: async ({ where }: { where: { user_id_idempotency_key: { user_id: string; idempotency_key: string } } }) =>
        receipts.get(`${where.user_id_idempotency_key.user_id}:${where.user_id_idempotency_key.idempotency_key}`) ?? null,
      create: async ({ data }: { data: { user_id: string; idempotency_key: string; request_hash: string; response_status: number; response_body: unknown } }) => {
        receipts.set(`${data.user_id}:${data.idempotency_key}`, data);
        return data;
      }
    }
  };
  return {
    execute: (key: string, payload: unknown) => executeIdempotentSubmission({
      prisma: { $transaction: async (callback: (inner: typeof tx) => Promise<unknown>) => callback(tx) } as never,
      userId: "user-1",
      key,
      payload,
      execute: async () => {
        executions += 1;
        return Response.json({ ok: true, executions }, { status: 200 });
      }
    }),
    executions: () => executions
  };
}

test("submission receipt replays the first successful response without running effects twice", async () => {
  const subject = harness();
  const first = await subject.execute("submission_key_0001", { releaseId: "r1", data: { title: "A" } });
  const retry = await subject.execute("submission_key_0001", { data: { title: "A" }, releaseId: "r1" });

  assert.equal(first.replayed, false);
  assert.equal(retry.replayed, true);
  assert.deepEqual(await retry.response.json(), { ok: true, executions: 1 });
  assert.equal(subject.executions(), 1);
});

test("submission receipt rejects reuse of a key with a different request", async () => {
  const subject = harness();
  await subject.execute("submission_key_0002", { releaseId: "r1", data: { title: "A" } });
  const conflict = await subject.execute("submission_key_0002", { releaseId: "r1", data: { title: "B" } });

  assert.equal(conflict.response.status, 409);
  assert.equal(subject.executions(), 1);
});
