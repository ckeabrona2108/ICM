import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const INSTANCE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/u;
const MARKER_NAME = ".community-e2e-owner.json";

export function resolveOwnedNextDist({ workspaceRoot, instance }) {
  const root = path.resolve(workspaceRoot);
  const normalizedInstance = String(instance ?? "").trim() || "default";
  if (!INSTANCE_PATTERN.test(normalizedInstance)) {
    throw new Error("SOCIAL_TEST_DB_INSTANCE must contain only lowercase letters, digits, and hyphens");
  }
  const relativeDistDir = `.next-e2e/${normalizedInstance}`;
  const distDir = path.resolve(root, relativeDistDir);
  const expectedParent = path.join(root, ".next-e2e");
  if (path.dirname(distDir) !== expectedParent) {
    throw new Error("Refusing to resolve an E2E Next dist directory outside .next-e2e");
  }
  return {
    version: 1,
    workspaceRoot: root,
    instance: normalizedInstance,
    relativeDistDir,
    distDir,
    markerFile: path.join(distDir, MARKER_NAME)
  };
}

export function assertOwnedNextDist(target) {
  if (!existsSync(target.markerFile)) {
    throw new Error(`Refusing to remove unowned E2E Next dist directory: ${target.distDir}`);
  }
  let marker;
  try {
    marker = JSON.parse(readFileSync(target.markerFile, "utf8"));
  } catch {
    throw new Error(`Invalid E2E Next dist ownership marker: ${target.markerFile}`);
  }
  for (const key of ["version", "workspaceRoot", "instance", "relativeDistDir", "distDir"]) {
    if (marker[key] !== target[key]) {
      throw new Error(`E2E Next dist ownership marker ${key} does not match`);
    }
  }
  return target;
}

export function prepareOwnedNextDist(options) {
  const target = resolveOwnedNextDist(options);
  if (existsSync(target.distDir)) {
    assertOwnedNextDist(target);
    rmSync(target.distDir, { recursive: true, force: true });
  }
  mkdirSync(target.distDir, { recursive: true, mode: 0o700 });
  writeFileSync(target.markerFile, `${JSON.stringify(target, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return target;
}

export function cleanupOwnedNextDist(target) {
  if (!existsSync(target.distDir)) return false;
  assertOwnedNextDist(target);
  rmSync(target.distDir, { recursive: true, force: true });
  return true;
}
