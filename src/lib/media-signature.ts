export type SniffedArtistSocialMedia = {
  mediaType: "image" | "audio" | "video";
  mimeType: string;
  extension: string;
};

function startsWithBytes(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function hasAscii(bytes: Uint8Array, start: number, text: string) {
  if (bytes.length < start + text.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[start + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function sniffImage(bytes: Uint8Array): SniffedArtistSocialMedia | null {
  if (bytes.length >= 3 && startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return { mediaType: "image", mimeType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mediaType: "image", mimeType: "image/png", extension: "png" };
  }
  if (bytes.length >= 6 && (hasAscii(bytes, 0, "GIF87a") || hasAscii(bytes, 0, "GIF89a"))) {
    return { mediaType: "image", mimeType: "image/gif", extension: "gif" };
  }
  if (bytes.length >= 12 && hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP")) {
    return { mediaType: "image", mimeType: "image/webp", extension: "webp" };
  }
  return null;
}

function sniffAudio(bytes: Uint8Array): SniffedArtistSocialMedia | null {
  if (bytes.length >= 12 && hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WAVE")) {
    return { mediaType: "audio", mimeType: "audio/wav", extension: "wav" };
  }
  if (bytes.length >= 4 && hasAscii(bytes, 0, "OggS")) {
    return { mediaType: "audio", mimeType: "audio/ogg", extension: "ogg" };
  }
  if (bytes.length >= 3 && hasAscii(bytes, 0, "ID3")) {
    return { mediaType: "audio", mimeType: "audio/mpeg", extension: "mp3" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    if ((bytes[1] & 0xf6) === 0xf0) {
      return { mediaType: "audio", mimeType: "audio/aac", extension: "aac" };
    }
    return { mediaType: "audio", mimeType: "audio/mpeg", extension: "mp3" };
  }
  return null;
}

function sniffIsoBmff(bytes: Uint8Array): SniffedArtistSocialMedia | null {
  if (bytes.length < 12 || !hasAscii(bytes, 4, "ftyp")) return null;
  const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (brand === "M4A ") {
    return { mediaType: "audio", mimeType: "audio/mp4", extension: "m4a" };
  }
  if (brand === "qt  ") {
    return { mediaType: "video", mimeType: "video/quicktime", extension: "mov" };
  }
  return { mediaType: "video", mimeType: "video/mp4", extension: "mp4" };
}

function sniffVideo(bytes: Uint8Array): SniffedArtistSocialMedia | null {
  const isoBmff = sniffIsoBmff(bytes);
  if (isoBmff) return isoBmff;
  if (bytes.length >= 4 && startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { mediaType: "video", mimeType: "video/webm", extension: "webm" };
  }
  return null;
}

export function sniffArtistSocialMedia(bytes: Uint8Array): SniffedArtistSocialMedia | null {
  return sniffImage(bytes) ?? sniffAudio(bytes) ?? sniffVideo(bytes);
}
