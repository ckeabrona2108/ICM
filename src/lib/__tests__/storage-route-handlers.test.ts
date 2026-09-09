import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeStorageReadRequest,
  handleAuthorizedStorageUpload
} from "../storage-route-handlers";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50
]);

test("cross-user object upload is rejected before reading the request body", async () => {
  let bodyRead = false;
  let uploaded = false;
  const response = await handleAuthorizedStorageUpload({
    request: new Request("http://localhost/api/uploads/object/artist-social/user-a/x.png", {
      method: "PUT",
      headers: { "Content-Type": "image/png" }
    }),
    rawKey: "artist-social/user-a/x.png",
    principalId: "user-b",
    readBody: async () => {
      bodyRead = true;
      return PNG_BYTES;
    },
    upload: async () => {
      uploaded = true;
      return { key: "artist-social/user-a/x.png" };
    }
  });

  assert.equal(response.status, 403);
  assert.equal(bodyRead, false);
  assert.equal(uploaded, false);
});

test("cross-user relay upload is rejected before reading or writing storage", async () => {
  let touched = false;
  const response = await handleAuthorizedStorageUpload({
    request: new Request("http://localhost/api/uploads/relay?key=uploads%2Fuser-a%2Ftrack.wav", {
      method: "POST",
      headers: { "Content-Type": "audio/wav" }
    }),
    rawKey: "uploads/user-a/track.wav",
    principalId: "user-b",
    readBody: async () => {
      touched = true;
      return new Uint8Array();
    },
    upload: async ({ key }) => {
      touched = true;
      return { key };
    }
  });

  assert.equal(response.status, 403);
  assert.equal(touched, false);
});

test("owner upload validates the payload signature before invoking storage", async () => {
  let uploaded = false;
  const response = await handleAuthorizedStorageUpload({
    request: new Request("http://localhost/api/uploads/object/artist-social/user-a/x.png", {
      method: "PUT",
      headers: { "Content-Type": "image/png", "Content-Length": String(PNG_BYTES.byteLength) }
    }),
    rawKey: "artist-social/user-a/x.png",
    principalId: "user-a",
    readBody: async () => PNG_BYTES,
    upload: async ({ key, bytes, contentType }) => {
      uploaded = true;
      assert.equal(key, "artist-social/user-a/x.png");
      assert.equal(bytes.byteLength, PNG_BYTES.byteLength);
      assert.equal(contentType, "image/png");
      return { key };
    }
  });

  assert.equal(response.status, 200);
  assert.equal(uploaded, true);
});

test("relay rejects oversized, MIME-mismatched and signature-mismatched bodies", async () => {
  const base = {
    rawKey: "previews/user-a/cover.png",
    principalId: "user-a",
    upload: async ({ key }: { key: string }) => ({ key })
  };

  const oversized = await handleAuthorizedStorageUpload({
    ...base,
    request: new Request("http://localhost/api/uploads/relay", {
      method: "POST",
      headers: { "Content-Type": "image/png", "Content-Length": String(20 * 1024 * 1024 + 1) }
    }),
    readBody: async () => {
      throw new Error("body must not be read");
    }
  });
  assert.equal(oversized.status, 413);

  const wrongMime = await handleAuthorizedStorageUpload({
    ...base,
    request: new Request("http://localhost/api/uploads/relay", {
      method: "POST",
      headers: { "Content-Type": "text/plain" }
    }),
    readBody: async () => PNG_BYTES
  });
  assert.equal(wrongMime.status, 415);

  const wrongSignature = await handleAuthorizedStorageUpload({
    ...base,
    request: new Request("http://localhost/api/uploads/relay", {
      method: "POST",
      headers: { "Content-Type": "image/png" }
    }),
    readBody: async () => new TextEncoder().encode("not a png")
  });
  assert.equal(wrongSignature.status, 415);
});

test("artist-social storage accepts only png, mp3 and mp4 payload families", async () => {
  const response = await handleAuthorizedStorageUpload({
    request: new Request("http://localhost/api/uploads/relay", {
      method: "POST",
      headers: { "Content-Type": "image/webp" }
    }),
    rawKey: "artist-social/user-a/post.webp",
    principalId: "user-a",
    readBody: async () => WEBP_BYTES,
    upload: async ({ key }: { key: string }) => ({ key })
  });

  assert.equal(response.status, 415);
});

test("read gate allows explicit public keys and denies private keys before probes", () => {
  assert.equal(authorizeStorageReadRequest(["artist-social", "user-a", "x.png"], null).allowed, true);
  const guestPrivate = authorizeStorageReadRequest(["private", "user-a", "reference.wav"], null);
  assert.equal(guestPrivate.allowed, false);
  if (!guestPrivate.allowed) assert.equal(guestPrivate.response.status, 401);
  assert.equal(authorizeStorageReadRequest(["private", "user-a", "reference.wav"], "user-a").allowed, true);
});

test("route read gate rejects encoded traversal before storage lookup", () => {
  for (const segments of [
    ["private", "user-a", "%2e%2e", "user-b", "reference.wav"],
    ["private", "user-a", "%252e%252e", "user-b", "reference.wav"],
    ["private", "user-a", "%252fuser-b", "reference.wav"]
  ]) {
    const result = authorizeStorageReadRequest(segments, "user-a");
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.equal(result.response.status, 400);
  }
});
