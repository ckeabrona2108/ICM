import path from "node:path";

export const SOCIAL_TEST_DATABASE_PREFIX = "icm_social_test_";
export const SOCIAL_TEST_SCHEMA = "icecream";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function fail(message) {
  throw new Error(`Unsafe social test database configuration: ${message}`);
}

export function assertSocialTestDatabaseUrl(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) fail("SOCIAL_TEST_DATABASE_URL is required");

  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("SOCIAL_TEST_DATABASE_URL is not a valid URL");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    fail("only PostgreSQL URLs are allowed");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    fail(`host ${url.hostname || "<empty>"} is not loopback`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database.startsWith(SOCIAL_TEST_DATABASE_PREFIX)) {
    fail(`database name must start with ${SOCIAL_TEST_DATABASE_PREFIX}`);
  }
  if (database.includes("/") || database.includes("\\") || database.includes("..")) {
    fail("database name contains an unsafe path segment");
  }

  const schema = url.searchParams.get("schema");
  if (schema !== SOCIAL_TEST_SCHEMA) {
    fail(`URL must include schema=${SOCIAL_TEST_SCHEMA}`);
  }

  return Object.freeze({
    database,
    hostname: url.hostname,
    port: url.port || "5432",
    schema,
    url: url.toString()
  });
}

export function assertOwnedRuntimeDirectory(params) {
  const runtimeRoot = path.resolve(params.runtimeRoot);
  const expectedRoot = path.resolve(params.expectedRoot);
  const marker = params.marker;

  if (runtimeRoot !== expectedRoot) {
    fail("runtime directory does not match the workspace-specific path");
  }
  if (!marker || marker.version !== 1) {
    fail("runtime ownership marker is missing or unsupported");
  }
  if (path.resolve(marker.runtimeRoot ?? "") !== expectedRoot) {
    fail("runtime ownership marker points at another directory");
  }
  if (path.resolve(marker.workspaceRoot ?? "") !== path.resolve(params.workspaceRoot)) {
    fail("runtime ownership marker belongs to another workspace");
  }

  const dataDir = path.resolve(marker.dataDir ?? "");
  const socketDir = path.resolve(marker.socketDir ?? "");
  const expectedPrefix = `${expectedRoot}${path.sep}`;
  if (!dataDir.startsWith(expectedPrefix) || !socketDir.startsWith(expectedPrefix)) {
    fail("runtime marker contains a path outside its owned directory");
  }

  return Object.freeze({ dataDir, runtimeRoot: expectedRoot, socketDir });
}
