import assert from "node:assert/strict";
import test from "node:test";

import type { ReleaseSubmitRequest } from "@/lib/api/contracts";
import {
  completePendingSubmission,
  readPendingSubmission,
  resolveSubmissionKey,
  savePendingSubmission
} from "@/lib/release-submission-client";

class QuotaStorage {
  readonly items = new Map<string, string>();
  constructor(private readonly quota: number) {}
  get length() { return this.items.size; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  getItem(key: string) { return this.items.get(key) ?? null; }
  removeItem(key: string) { this.items.delete(key); }
  setItem(key: string, value: string) {
    const used = [...this.items].reduce((sum, [k, v]) => sum + (k === key ? 0 : k.length + v.length), 0);
    if (used + key.length + value.length > this.quota) {
      throw new Error(`Failed to execute 'setItem' on 'Storage': Setting the value of '${key}' exceeded the quota.`);
    }
    this.items.set(key, value);
  }
}

const releaseId = "8aa7d6c4-eadf-429e-b803-591df026dc33";
const hugeCover = `data:image/png;base64,${"A".repeat(200_000)}`;
const payload = {
  mode: "new",
  releaseId,
  data: { cover: hugeCover, tracks: [{ lyrics: "x".repeat(50_000), ttml: "<tt>".repeat(20_000) }] }
} as unknown as ReleaseSubmitRequest;
const snapshot = JSON.stringify(payload.data);
const draft = { releaseId, draftsCount: 1 };

test("pending submission stores only a small record, never the release payload", () => {
  const storage = new QuotaStorage(5_000);
  assert.equal(savePendingSubmission(storage, { key: "key-1234567890abcdef", snapshot, draft, payload }), true);
  const raw = storage.getItem(`icm:release-submission:${releaseId}`)!;
  assert.ok(raw.length < 500);
  assert.ok(!raw.includes("data:image"));

  const pending = readPendingSubmission(storage, releaseId, snapshot);
  assert.equal(pending?.key, "key-1234567890abcdef");
  assert.deepEqual(pending?.draft, draft);
  assert.equal(resolveSubmissionKey(pending, payload, () => "new-key"), "key-1234567890abcdef");
  const changed = { ...payload, currentStatus: "draft" } as ReleaseSubmitRequest;
  assert.equal(resolveSubmissionKey(pending, changed, () => "new-key"), "new-key");
  assert.equal(readPendingSubmission(storage, releaseId, `${snapshot} `), null);

  completePendingSubmission(storage, releaseId);
  assert.equal(storage.length, 0);
});

test("quota overflow never throws and frees stale submission records", () => {
  const storage = new QuotaStorage(400);
  storage.items.set("icm:release-submission:old-release", "x".repeat(300));
  storage.items.set("unrelated", "keep");

  assert.equal(savePendingSubmission(storage, { key: "key-1234567890abcdef", snapshot, draft, payload }), true);
  assert.equal(storage.getItem("icm:release-submission:old-release"), null);
  assert.equal(storage.getItem("unrelated"), "keep");
  assert.ok(readPendingSubmission(storage, releaseId, snapshot));

  const full = new QuotaStorage(0);
  assert.doesNotThrow(() => savePendingSubmission(full, { key: "key-1234567890abcdef", snapshot, draft, payload }));
  assert.equal(savePendingSubmission(full, { key: "key-1234567890abcdef", snapshot, draft, payload }), false);
  assert.equal(readPendingSubmission(full, releaseId, snapshot), null);
});

test("legacy full-payload records are dropped on read", () => {
  const storage = new QuotaStorage(1_000_000);
  storage.items.set(`icm:release-submission:${releaseId}`, JSON.stringify({ key: "k", snapshot, draft, payload }));
  assert.equal(readPendingSubmission(storage, releaseId, snapshot), null);
  assert.equal(storage.length, 0);
});

test("throwing storage access is tolerated", () => {
  const broken = {
    length: 0,
    key: () => null,
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("SecurityError"); },
    removeItem: () => { throw new Error("SecurityError"); }
  };
  assert.equal(readPendingSubmission(broken, releaseId, snapshot), null);
  assert.equal(savePendingSubmission(broken, { key: "key-1234567890abcdef", snapshot, draft, payload }), false);
  assert.doesNotThrow(() => completePendingSubmission(broken, releaseId));
});
