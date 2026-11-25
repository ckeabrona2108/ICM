import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";

import * as lib from "@/lib/plugin-license";

const { privateKey } = generateKeyPairSync("ed25519");
process.env.PLUGIN_LICENSE_PRIVATE_KEY = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("base64");


// ключи читаются при вызове, поэтому их можно задать после импорта

test("token round-trips and rejects tampering", () => {
  const token = lib.createPluginToken({ uid: "u1", did: "device-abcdef-123456", pv: "pv" });
  assert.deepEqual(
    { ...lib.verifyPluginToken(token), iat: 0 },
    { uid: "u1", did: "device-abcdef-123456", pv: "pv", iat: 0 }
  );
  const [p, body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "u2", did: "device-abcdef-123456", pv: "pv", iat: 1 })).toString("base64url");
  assert.equal(lib.verifyPluginToken(`${p}.${forged}.${mac}`), null);
  assert.equal(lib.verifyPluginToken(`${p}.${body}.x${mac}`), null);
  assert.equal(lib.verifyPluginToken("garbage"), null);
});

test("token expires after 180 days", () => {
  const token = lib.createPluginToken({ uid: "u1", did: "device-abcdef-123456", pv: "pv" }, 0);
  assert.ok(lib.verifyPluginToken(token, 179 * 86400_000));
  assert.equal(lib.verifyPluginToken(token, 181 * 86400_000), null);
});

test("license is signed with Ed25519 over the body string", () => {
  const license = lib.buildPluginLicense({
    userId: "u1", email: "a@b.c", name: "A", deviceId: "device-abcdef-123456",
    active: true, plan: "pro", endsAt: null, now: 1_000_000_000_000
  });
  const [body, sig] = license.split(".");
  const raw = Buffer.from(lib.pluginLicensePublicKeyBase64(), "base64");
  const pub = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]), format: "der", type: "spki" });
  assert.ok(verify(null, Buffer.from(body), pub, Buffer.from(sig, "base64url")));

  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  assert.equal(payload.active, true);
  assert.equal(payload.exp - payload.iat, 7 * 86400);
  assert.equal(verify(null, Buffer.from(body + "x"), pub, Buffer.from(sig, "base64url")), false);
});

test("device id validation", () => {
  assert.equal(lib.normalizeDeviceId("short"), null);
  assert.equal(lib.normalizeDeviceId("abc def ghi jkl mno"), null);
  assert.equal(lib.normalizeDeviceId("  AbCdEf0123456789_-  "), "AbCdEf0123456789_-");
});

test("browser link: pending, confirmed once, wrong secret and expiry", () => {
  const link = lib.startPluginLink({ deviceId: "device-abcdef-123456", deviceName: "Mac", product: "GLAZE" }, 0);
  assert.match(link.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/u);
  assert.equal(lib.normalizeLinkCode(link.code.toLowerCase().replace("-", " ")), link.code);

  assert.equal(lib.pollPluginLink(link.code, link.pollSecret, 1).status, "pending");
  assert.equal(lib.pollPluginLink(link.code, "wrong", 1).status, "expired");
  assert.ok(lib.confirmPluginLink(link.code, "user-1", 2));
  assert.equal(lib.confirmPluginLink(link.code, "user-2", 2), null);

  const done = lib.pollPluginLink(link.code, link.pollSecret, 3);
  assert.equal(done.status, "confirmed");
  assert.equal(lib.pollPluginLink(link.code, link.pollSecret, 4).status, "expired");

  const old = lib.startPluginLink({ deviceId: "device-abcdef-123456", deviceName: "", product: "" }, 0);
  assert.equal(lib.pollPluginLink(old.code, old.pollSecret, 11 * 60_000).status, "expired");
});

test("trial license never outlives the trial", () => {
  const now = Date.UTC(2026, 10, 21);
  const trialEnd = now + 2 * 86400_000;
  const license = lib.buildPluginLicense({
    userId: "u1", email: "a@b.c", name: null, deviceId: "device-abcdef-123456",
    active: true, plan: "trial", endsAt: new Date(trialEnd).toISOString(), expiresBefore: trialEnd, now
  });
  const payload = JSON.parse(Buffer.from(license.split(".")[0], "base64url").toString("utf8"));
  assert.equal(payload.exp, Math.floor(trialEnd / 1000));
  assert.equal(payload.plan, "trial");

  const normal = lib.buildPluginLicense({
    userId: "u1", email: "a@b.c", name: null, deviceId: "device-abcdef-123456",
    active: true, plan: "pro", endsAt: null, now
  });
  const normalPayload = JSON.parse(Buffer.from(normal.split(".")[0], "base64url").toString("utf8"));
  assert.equal(normalPayload.exp, Math.floor(now / 1000) + 7 * 86400);
});
