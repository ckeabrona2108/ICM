import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOwnedRuntimeDirectory,
  assertSocialTestDatabaseUrl
} from "./social-test-db-policy.mjs";

test("accepts an explicit loopback social test database", () => {
  const target = assertSocialTestDatabaseUrl(
    "postgresql://postgres@127.0.0.1:55432/icm_social_test_e2e_community?schema=icecream"
  );

  assert.equal(target.database, "icm_social_test_e2e_community");
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.port, "55432");
});

test("rejects the ambient shared database name", () => {
  assert.throws(
    () => assertSocialTestDatabaseUrl("postgresql://postgres@localhost:5432/icecream?schema=icecream"),
    /database name must start with icm_social_test_/u
  );
});

test("rejects remote hosts and a missing canonical schema", () => {
  assert.throws(
    () => assertSocialTestDatabaseUrl("postgresql://postgres@db.example.test/icm_social_test_ci?schema=icecream"),
    /is not loopback/u
  );
  assert.throws(
    () => assertSocialTestDatabaseUrl("postgresql://postgres@127.0.0.1/icm_social_test_ci"),
    /must include schema=icecream/u
  );
});

test("rejects encoded traversal in a database name", () => {
  assert.throws(
    () => assertSocialTestDatabaseUrl("postgresql://postgres@127.0.0.1/icm_social_test_%2E%2E%2Ficecream?schema=icecream"),
    /unsafe path segment/u
  );
});

test("accepts only a workspace-owned disposable runtime directory", () => {
  const marker = {
    version: 1,
    runtimeRoot: "/tmp/icm-social-test-db-abc",
    workspaceRoot: "/workspace/icm",
    dataDir: "/tmp/icm-social-test-db-abc/data",
    socketDir: "/tmp/icm-social-test-db-abc/socket"
  };

  const owned = assertOwnedRuntimeDirectory({
    runtimeRoot: marker.runtimeRoot,
    expectedRoot: marker.runtimeRoot,
    workspaceRoot: marker.workspaceRoot,
    marker
  });
  assert.equal(owned.dataDir, marker.dataDir);

  assert.throws(
    () => assertOwnedRuntimeDirectory({
      runtimeRoot: "/tmp/icm-social-test-db-other",
      expectedRoot: marker.runtimeRoot,
      workspaceRoot: marker.workspaceRoot,
      marker
    }),
    /does not match/u
  );
});
