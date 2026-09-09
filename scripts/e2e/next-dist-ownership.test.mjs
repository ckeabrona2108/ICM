import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cleanupOwnedNextDist,
  prepareOwnedNextDist,
  resolveOwnedNextDist
} from "./next-dist-ownership.mjs";

test("uses one repo-local Next dist directory per disposable DB instance", () => {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "community-e2e-next-dist-"));
  try {
    const first = prepareOwnedNextDist({ workspaceRoot, instance: "run-a" });
    const second = prepareOwnedNextDist({ workspaceRoot, instance: "run-b" });
    assert.equal(first.relativeDistDir, ".next-e2e/run-a");
    assert.equal(second.relativeDistDir, ".next-e2e/run-b");
    assert.notEqual(first.distDir, second.distDir);
    assert.equal(cleanupOwnedNextDist(first), true);
    assert.equal(cleanupOwnedNextDist(second), true);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("refuses to clean an existing dist directory without its exact ownership marker", () => {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "community-e2e-next-dist-"));
  try {
    const target = resolveOwnedNextDist({ workspaceRoot, instance: "foreign" });
    mkdirSync(target.distDir, { recursive: true });
    assert.throws(
      () => cleanupOwnedNextDist(target),
      /Refusing to remove unowned E2E Next dist directory/u
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("rejects traversal and non-canonical instance names", () => {
  assert.throws(
    () => resolveOwnedNextDist({ workspaceRoot: "/tmp/workspace", instance: "../shared" }),
    /only lowercase letters/u
  );
});
