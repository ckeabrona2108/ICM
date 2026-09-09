import assert from "node:assert/strict";
import test from "node:test";

import { sniffArtistSocialMedia } from "@/lib/media-signature";

test("sniffArtistSocialMedia detects allowed image formats", () => {
  assert.deepEqual(sniffArtistSocialMedia(new Uint8Array([0xff, 0xd8, 0xff, 0xdb])), {
    mediaType: "image",
    mimeType: "image/jpeg",
    extension: "jpg"
  });
  assert.deepEqual(sniffArtistSocialMedia(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), {
    mediaType: "image",
    mimeType: "image/png",
    extension: "png"
  });
});

test("sniffArtistSocialMedia detects allowed audio and video formats", () => {
  assert.deepEqual(sniffArtistSocialMedia(new Uint8Array([0x49, 0x44, 0x33, 0x04])), {
    mediaType: "audio",
    mimeType: "audio/mpeg",
    extension: "mp3"
  });
  assert.deepEqual(sniffArtistSocialMedia(new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20])), {
    mediaType: "audio",
    mimeType: "audio/mp4",
    extension: "m4a"
  });
  assert.deepEqual(sniffArtistSocialMedia(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42])), {
    mediaType: "video",
    mimeType: "video/webm",
    extension: "webm"
  });
});

test("sniffArtistSocialMedia rejects unknown bytes", () => {
  assert.equal(sniffArtistSocialMedia(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), null);
});
