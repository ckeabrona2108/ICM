import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeStorageRead,
  authorizeStorageWrite,
  classifyStorageObject,
  isPublicStreamableStorageKey,
  normalizeStorageKeySegments,
  selectUniqueStorageKeyFallback
} from "../storage-object-access";
import { getStorageReadBucketCandidates } from "../s3";

test("allows legacy audio roots to stream through the public storage endpoint", () => {
  assert.equal(
    isPublicStreamableStorageKey(["audios", "5d0cbfb1-ac3d-4346-8a85-d7cc802a2b8a.WAV"]),
    true
  );
  assert.equal(isPublicStreamableStorageKey(["audio", "release.wav"]), true);
  assert.equal(isPublicStreamableStorageKey(["contracts", "audios", "release.wav"]), true);
});

test("does not expose private storage roots", () => {
  assert.equal(isPublicStreamableStorageKey(["verification", "passport.pdf"]), false);
  assert.equal(isPublicStreamableStorageKey(["contracts", "signatures", "contract.pdf"]), false);
  assert.equal(isPublicStreamableStorageKey(["audios"]), false);
});

test("finds a legacy audio object by filename across allowed audio prefixes", () => {
  assert.equal(
    selectUniqueStorageKeyFallback({
      requestedKey: "audios/5d0cbfb1-ac3d-4346-8a85-d7cc802a2b8a.WAV",
      candidateKeys: ["tracks/5d0cbfb1-ac3d-4346-8a85-d7cc802a2b8a.wav"],
      allowedPrefixes: ["tracks/", "uploads/", "contracts/uploads/", "audio/", "audios/"]
    }),
    "tracks/5d0cbfb1-ac3d-4346-8a85-d7cc802a2b8a.wav"
  );
});

test("does not guess when the same audio filename exists in multiple storage roots", () => {
  assert.equal(
    selectUniqueStorageKeyFallback({
      requestedKey: "audios/release.WAV",
      candidateKeys: ["tracks/release.wav", "contracts/uploads/release.WAV"],
      allowedPrefixes: ["tracks/", "contracts/uploads/", "audios/"]
    }),
    null
  );
});

test("checks the contracts bucket first for track audio", () => {
  const candidates = getStorageReadBucketCandidates("tracks/release/audio.WAV");

  assert.equal(candidates[0], "contracts");
  assert.equal(candidates.includes("uploads"), true);
});

test("binds every user-writable namespace to the authenticated owner", () => {
  for (const key of [
    "artist-social/user-a/post.webp",
    "artist-profiles/user-a/avatar.webp",
    "uploads/user-a/track.wav",
    "previews/user-a/cover.webp",
    "covers/user-a/cover.webp",
    "private/user-a/reference.wav",
    "avatars/user-a.webp"
  ]) {
    assert.equal(authorizeStorageWrite(key, "user-a").allowed, true, key);
    assert.deepEqual(authorizeStorageWrite(key, "user-b"), {
      allowed: false,
      status: 403,
      reason: "foreign_owner"
    }, key);
  }
});

test("denies generic writes to system and unknown namespaces", () => {
  for (const key of [
    "tracks/release/audio.wav",
    "contracts/signatures/user-a/signature.png",
    "verification/passport.pdf",
    "Artist-social/user-a/post.webp",
    "unknown/user-a/file.bin"
  ]) {
    assert.equal(authorizeStorageWrite(key, "user-a").allowed, false, key);
  }
});

test("distinguishes public, owner-private and dedicated-route reads", () => {
  assert.deepEqual(classifyStorageObject("artist-social/user-a/post.webp"), {
    ownerKind: "user",
    ownerId: "user-a",
    read: "public",
    write: "owner"
  });
  assert.equal(authorizeStorageRead("artist-social/user-a/post.webp", null).allowed, true);
  assert.equal(authorizeStorageRead("uploads/legacy-public.wav", null).allowed, true);

  assert.deepEqual(authorizeStorageRead("private/user-a/reference.wav", null), {
    allowed: false,
    status: 401,
    reason: "authentication_required"
  });
  assert.equal(authorizeStorageRead("private/user-a/reference.wav", "user-a").allowed, true);
  assert.deepEqual(authorizeStorageRead("private/user-a/reference.wav", "user-b"), {
    allowed: false,
    status: 403,
    reason: "foreign_owner"
  });

  assert.equal(authorizeStorageRead("contracts/signatures/user-a/signature.png", "user-a").allowed, false);
  assert.equal(authorizeStorageRead("verification/passport.pdf", "user-a").allowed, false);
});

test("normalizes valid encoded names but rejects traversal and ambiguous encoding", () => {
  assert.deepEqual(
    normalizeStorageKeySegments(["artist-social", "user-a", "hello%20world.webp"]),
    ["artist-social", "user-a", "hello world.webp"]
  );

  for (const segments of [
    ["artist-social", "user-a", "..", "user-b", "x.webp"],
    ["artist-social", "user-a", "%2e%2e", "user-b", "x.webp"],
    ["artist-social", "user-a", "%252e%252e", "user-b", "x.webp"],
    ["artist-social", "user-a", "%2fetc"],
    ["artist-social", "user-a", "%252fetc"],
    ["artist-social", "user-a", "\\evil"],
    ["artist-social", "", "x.webp"],
    ["artist-social", "user-a", "%E0%A4%A"]
  ]) {
    assert.equal(normalizeStorageKeySegments(segments), null, segments.join("/"));
  }
});
