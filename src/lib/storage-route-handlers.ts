import { sniffArtistSocialMedia } from "./media-signature";
import {
  authorizeStorageRead,
  authorizeStorageWrite,
  normalizeStorageKeySegments
} from "./storage-object-access";

const MB = 1024 * 1024;

type UploadResult = { key: string; [key: string]: unknown };

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export function normalizeStorageRouteKey(rawKey: string): string | null {
  const value = rawKey.trim().replace(/^\/+/, "");
  if (!value) return null;
  const segments = normalizeStorageKeySegments(value.split("/"));
  return segments?.join("/") ?? null;
}

export function authorizeStorageReadRequest(
  rawSegments: string[] | undefined,
  principalId: string | null | undefined
): { allowed: true; key: string; segments: string[] } | { allowed: false; response: Response } {
  const segments = normalizeStorageKeySegments(rawSegments);
  if (!segments) return { allowed: false, response: jsonError("Invalid storage key", 400) };
  const key = segments.join("/");
  const decision = authorizeStorageRead(key, principalId);
  if (!decision.allowed) {
    return {
      allowed: false,
      response: jsonError(decision.status === 401 ? "Unauthorized" : "Forbidden", decision.status)
    };
  }
  return { allowed: true, key, segments };
}

function maxUploadBytes(key: string): number {
  const root = key.split("/")[0] ?? "";
  if (root === "avatars" || root === "artist-profiles") return 8 * MB;
  if (root === "previews" || root === "covers") return 20 * MB;
  if (root === "artist-social") {
    const ext = extensionOf(key);
    if (ext === "png") return 8 * MB;
    if (ext === "mp3") return 25 * MB;
    if (ext === "mp4") return 80 * MB;
    return 8 * MB;
  }
  // Relay is a fallback path and buffers the body. Keep it bounded even though
  // direct multipart/presigned product flows can support larger source files.
  return 100 * MB;
}

function normalizeContentType(value: string | null): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function extensionOf(key: string): string {
  const fileName = key.split("/").at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

type DetectedUpload = { kind: "image" | "audio" | "video" | "text"; mimeType: string; extensions: string[] };

function hasAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  if (bytes.length < offset + value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

function detectAdditionalUpload(bytes: Uint8Array): DetectedUpload | null {
  if (hasAscii(bytes, 0, "fLaC")) {
    return { kind: "audio", mimeType: "audio/flac", extensions: ["flac"] };
  }
  if (hasAscii(bytes, 0, "FORM") && (hasAscii(bytes, 8, "AIFF") || hasAscii(bytes, 8, "AIFC"))) {
    return { kind: "audio", mimeType: "audio/aiff", extensions: ["aif", "aiff"] };
  }
  if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "AVI ")) {
    return { kind: "video", mimeType: "video/x-msvideo", extensions: ["avi"] };
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 4096))).trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<tt(?:\s|>)/iu.test(text)) {
    return { kind: "text", mimeType: "application/ttml+xml", extensions: ["ttml"] };
  }
  return null;
}

function detectUpload(bytes: Uint8Array): DetectedUpload | null {
  const social = sniffArtistSocialMedia(bytes);
  if (social) {
    const extensions = social.extension === "jpg" ? ["jpg", "jpeg", "jpe", "jfif"] : [social.extension];
    return { kind: social.mediaType, mimeType: social.mimeType, extensions };
  }
  return detectAdditionalUpload(bytes);
}

function contentTypeMatches(claimed: string, detected: DetectedUpload): boolean {
  if (claimed === detected.mimeType) return true;
  if (detected.mimeType === "audio/wav" && claimed === "audio/x-wav") return true;
  if (detected.mimeType === "audio/aiff" && claimed === "audio/x-aiff") return true;
  if (detected.mimeType === "image/jpeg" && claimed === "image/jpg") return true;
  if (detected.mimeType === "audio/mp4" && ["audio/x-m4a", "audio/m4a"].includes(claimed)) return true;
  return false;
}

function namespaceAccepts(key: string, detected: DetectedUpload): boolean {
  const root = key.split("/")[0] ?? "";
  if (["avatars", "artist-profiles", "previews", "covers"].includes(root)) return detected.kind === "image";
  if (root === "artist-social") {
    return (
      (detected.kind === "image" && detected.mimeType === "image/png")
      || (detected.kind === "audio" && detected.mimeType === "audio/mpeg")
      || (detected.kind === "video" && detected.mimeType === "video/mp4")
    );
  }
  if (root === "private") return detected.kind === "image" || detected.kind === "audio";
  return true;
}

export async function handleAuthorizedStorageUpload(input: {
  request: Request;
  rawKey: string;
  principalId: string | null | undefined;
  readBody?: () => Promise<Uint8Array>;
  upload: (input: { key: string; bytes: Uint8Array; contentType: string }) => Promise<UploadResult>;
  success?: (result: UploadResult) => Response;
}): Promise<Response> {
  const key = normalizeStorageRouteKey(input.rawKey);
  if (!key) return jsonError("Invalid storage key", 400);

  const authorization = authorizeStorageWrite(key, input.principalId);
  if (!authorization.allowed) {
    return jsonError(authorization.status === 401 ? "Unauthorized" : "Forbidden", authorization.status);
  }

  const maxBytes = maxUploadBytes(key);
  const contentLength = Number(input.request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return jsonError("Upload is too large", 413);
  }

  const contentType = normalizeContentType(input.request.headers.get("content-type"));
  if (!contentType) return jsonError("Content-Type is required", 415);
  const bytes = input.readBody
    ? await input.readBody()
    : new Uint8Array(await input.request.arrayBuffer());
  if (bytes.byteLength === 0) return jsonError("Empty upload body", 400);
  if (bytes.byteLength > maxBytes) return jsonError("Upload is too large", 413);

  const detected = detectUpload(bytes);
  const extension = extensionOf(key);
  if (
    !detected ||
    !detected.extensions.includes(extension) ||
    !contentTypeMatches(contentType, detected) ||
    !namespaceAccepts(key, detected)
  ) {
    return jsonError("File type does not match its content", 415);
  }

  const result = await input.upload({ key, bytes, contentType: detected.mimeType });
  return input.success?.(result) ?? Response.json(result, { status: 200 });
}
