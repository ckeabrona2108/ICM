#!/usr/bin/env node

import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  assertOwnedRuntimeDirectory,
  assertSocialTestDatabaseUrl
} from "./social-test-db-policy.mjs";

const workspaceRoot = path.resolve(process.cwd());
const workspaceHash = createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 12);
const instance = String(process.env.SOCIAL_TEST_DB_INSTANCE ?? "").trim();
if (instance && !/^[a-z0-9][a-z0-9-]{0,31}$/u.test(instance)) {
  throw new Error("SOCIAL_TEST_DB_INSTANCE must contain only lowercase letters, digits, and hyphens");
}
const instanceSuffix = instance ? `-${instance}` : "";
const runtimeName = instance
  ? `icm-pg-${workspaceHash}${instanceSuffix}`
  : `icm-social-test-db-${workspaceHash}`;
const runtimeRoot = path.join(os.tmpdir(), runtimeName);
const dataDir = path.join(runtimeRoot, "data");
const socketDir = path.join(runtimeRoot, "socket");
const e2eStorageRoot = path.join(runtimeRoot, "storage-e2e");
const logFile = path.join(runtimeRoot, "postgres.log");
const markerFile = path.join(runtimeRoot, "owner.json");
const port = parsePort(process.env.SOCIAL_TEST_DB_PORT ?? "55432");
const database = `icm_social_test_e2e_${workspaceHash}${instance ? `_${instance.replaceAll("-", "_")}` : ""}`;
const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/${database}?schema=icecream`;

assertSocialTestDatabaseUrl(databaseUrl);

function parsePort(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error("SOCIAL_TEST_DB_PORT must be an integer between 1024 and 65535");
  }
  return value;
}

function executable(name) {
  const candidates = [
    path.join("/opt/homebrew/bin", name),
    ...String(process.env.PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, name))
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through the bounded executable candidates.
    }
  }
  throw new Error(`${name} is required; install PostgreSQL 16 client/server tools first`);
}

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "pipe"
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(`${path.basename(binary)} failed${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function isReady() {
  const result = run(executable("pg_isready"), [
    "--host", "127.0.0.1",
    "--port", String(port),
    "--dbname", database
  ], { allowFailure: true });
  return result.status === 0;
}

function readMarker() {
  if (!existsSync(markerFile)) return null;
  try {
    return JSON.parse(readFileSync(markerFile, "utf8"));
  } catch {
    throw new Error(`Invalid runtime ownership marker: ${markerFile}`);
  }
}

function validateMarker() {
  return assertOwnedRuntimeDirectory({
    expectedRoot: runtimeRoot,
    marker: readMarker(),
    runtimeRoot,
    e2eStorageRoot,
    workspaceRoot
  });
}

function writeMarker() {
  writeFileSync(markerFile, `${JSON.stringify({
    version: 1,
    runtimeRoot,
    workspaceRoot,
    dataDir,
    socketDir,
    database,
    instance,
    port
  }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

function printConnection(format = "json") {
  const payload = {
    database,
    databaseUrl,
    directUrl: databaseUrl,
    e2eStorageRoot,
    host: "127.0.0.1",
    port,
    runtimeRoot,
    socialTestDatabaseUrl: databaseUrl
  };
  if (format === "shell") {
    process.stdout.write([
      `export SOCIAL_TEST_DATABASE_URL='${databaseUrl}'`,
      `export DATABASE_URL='${databaseUrl}'`,
      `export DIRECT_URL='${databaseUrl}'`,
      "export E2E_DISPOSABLE_DATABASE='1'",
      "export E2E_DISPOSABLE_STORAGE='1'",
      `export E2E_STORAGE_ROOT='${e2eStorageRoot}'`
    ].join("\n") + "\n");
    return;
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function start() {
  const existingMarker = readMarker();
  if (existingMarker) {
    validateMarker();
    if (isReady()) {
      printConnection();
      return;
    }
  } else if (isReady()) {
    throw new Error(`Port ${port} is already serving PostgreSQL without this workspace's ownership marker`);
  }

  mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
  mkdirSync(socketDir, { recursive: true, mode: 0o700 });
  mkdirSync(e2eStorageRoot, { recursive: true, mode: 0o700 });
  if (!existingMarker) writeMarker();

  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    run(executable("initdb"), [
      "--pgdata", dataDir,
      "--username", "postgres",
      "--auth", "trust",
      "--encoding", "UTF8",
      "--no-locale"
    ]);
  }

  run(executable("pg_ctl"), [
    "--pgdata", dataDir,
    "--log", logFile,
    "--options", `-p ${port} -h 127.0.0.1 -k ${socketDir}`,
    "--wait",
    "start"
  ]);

  const createResult = run(executable("createdb"), [
    "--host", "127.0.0.1",
    "--port", String(port),
    "--username", "postgres",
    database
  ], { allowFailure: true });
  const createError = String(createResult.stderr ?? "");
  if (createResult.status !== 0 && !/already exists/iu.test(createError)) {
    throw new Error(`createdb failed: ${createError.trim()}`);
  }

  if (!isReady()) throw new Error("Disposable PostgreSQL started but the test database is not ready");
  printConnection();
}

function stop() {
  if (!existsSync(markerFile)) {
    if (isReady()) {
      throw new Error(`Refusing to stop PostgreSQL on port ${port} without an ownership marker`);
    }
    process.stdout.write("Disposable social test database is already stopped.\n");
    return;
  }

  const owned = validateMarker();
  if (existsSync(path.join(owned.dataDir, "PG_VERSION"))) {
    const result = run(executable("pg_ctl"), [
      "--pgdata", owned.dataDir,
      "--wait",
      "--mode", "fast",
      "stop"
    ], { allowFailure: true });
    const message = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (result.status !== 0 && !/no server running|does not exist/iu.test(message)) {
      throw new Error(`pg_ctl stop failed: ${message.trim()}`);
    }
  }
  process.stdout.write("Disposable social test database stopped.\n");
}

function destroy() {
  if (!existsSync(markerFile)) {
    throw new Error(`Refusing to remove unowned runtime directory: ${runtimeRoot}`);
  }
  const owned = validateMarker();
  stop();
  rmSync(owned.runtimeRoot, { force: true, recursive: true });
  process.stdout.write(`Removed disposable runtime ${owned.runtimeRoot}.\n`);
}

function status() {
  const marker = readMarker();
  if (marker) validateMarker();
  process.stdout.write(`${JSON.stringify({
    database,
    owned: Boolean(marker),
    port,
    ready: isReady(),
    runtimeRoot
  }, null, 2)}\n`);
}

function runWithTestEnvironment(commandArgs) {
  if (commandArgs.length === 0) throw new Error("run requires a command after --");
  start();
  const [command, ...args] = commandArgs;
  const result = spawnSync(command, args, {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      SOCIAL_TEST_DATABASE_URL: databaseUrl,
      COMMUNITY_E2E_ALLOW: "1",
      E2E_DISPOSABLE_DATABASE: "1",
      E2E_DISPOSABLE_STORAGE: "1",
      E2E_STORAGE_ROOT: e2eStorageRoot,
      E2E_USER_A_EMAIL: "social-a@example.test",
      E2E_USER_A_PASSWORD: "SocialTest123!",
      E2E_USER_B_EMAIL: "social-b@example.test",
      E2E_USER_B_PASSWORD: "SocialTest123!",
      E2E_USER_C_EMAIL: "social-c@example.test",
      E2E_USER_C_PASSWORD: "SocialTest123!",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "community-e2e-local-secret-not-for-production",
      NODE_ENV: "test"
    },
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function usage() {
  process.stdout.write(`Usage:
  node scripts/test-db/social-test-db.mjs start
  node scripts/test-db/social-test-db.mjs status
  node scripts/test-db/social-test-db.mjs env
  node scripts/test-db/social-test-db.mjs run -- <command> [args...]
  node scripts/test-db/social-test-db.mjs stop
  node scripts/test-db/social-test-db.mjs destroy

The launcher owns a workspace-specific PostgreSQL cluster under the OS temporary
directory. It never connects to an ambient DATABASE_URL.
`);
}

try {
  const [command = "help", ...args] = process.argv.slice(2);
  switch (command) {
    case "start": start(); break;
    case "status": status(); break;
    case "env": printConnection("shell"); break;
    case "run": runWithTestEnvironment(args[0] === "--" ? args.slice(1) : args); break;
    case "stop": stop(); break;
    case "destroy": destroy(); break;
    case "help":
    case "--help":
    case "-h": usage(); break;
    default: throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
