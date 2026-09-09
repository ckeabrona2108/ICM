import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { createPresignedUpload, getStorageBucketHint, resolveStoredFileUrl } from "@/lib/s3";
import { enforceRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(100),
  kind: z.enum(["audio", "cover", "social"]).optional()
});

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "audio/wav", "audio/x-wav", "audio/flac", "audio/mpeg", "audio/aac", "audio/ogg",
  "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aiff", "audio/x-aiff",
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "application/ttml+xml"
]);

const SOCIAL_ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "audio/mpeg",
  "video/mp4"
]);

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^\.+/u, "")
    .slice(0, 120) || "file.bin";
}

function isFileNameCompatible(fileName: string, contentType: string): boolean {
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  const allowedExtensions: Record<string, readonly string[]> = {
    "image/jpeg": ["jpg", "jpeg", "jpe", "jfif"],
    "image/jpg": ["jpg", "jpeg", "jpe", "jfif"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
    "audio/wav": ["wav"],
    "audio/x-wav": ["wav"],
    "audio/flac": ["flac"],
    "audio/mpeg": ["mp3"],
    "audio/aac": ["aac"],
    "audio/ogg": ["ogg"],
    "audio/mp4": ["m4a", "mp4"],
    "audio/x-m4a": ["m4a"],
    "audio/m4a": ["m4a"],
    "audio/aiff": ["aif", "aiff"],
    "audio/x-aiff": ["aif", "aiff"],
    "video/mp4": ["mp4"],
    "video/quicktime": ["mov"],
    "video/x-msvideo": ["avi"],
    "video/webm": ["webm"],
    "application/ttml+xml": ["ttml"]
  };
  return Boolean(extension && allowedExtensions[contentType]?.includes(extension));
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = enforceRateLimit({
    key: `upload:presigned:${session.user.id}`,
    limit: 60,
    windowMs: 10 * 60_000
  });
  if (limited) return limited;

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const contentType = parsed.data.contentType.toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Unsupported upload type" }, { status: 415 });
  }
  if (parsed.data.kind === "social" && !SOCIAL_ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Для публикации доступны только PNG, MP3 и MP4" }, { status: 415 });
  }
  const fileName = sanitizeFileName(parsed.data.fileName);
  if (!isFileNameCompatible(fileName, contentType)) {
    return NextResponse.json({ error: "File extension does not match Content-Type" }, { status: 415 });
  }
  if (parsed.data.kind === "cover" && !contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Cover must be an image" }, { status: 415 });
  }

  const storageRoot = parsed.data.kind === "cover"
    ? "previews"
    : parsed.data.kind === "social"
      ? "artist-social"
      : "uploads";
  const key = `${storageRoot}/${session.user.id}/${Date.now()}-${fileName}`;
  const signed = await createPresignedUpload({
    key,
    contentType
  });
  const publicUrl =
    resolveStoredFileUrl({
      storageKey: key
    }) ?? `/api/uploads/object/${key.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
  const bucket = getStorageBucketHint();

  if (process.env.STORAGE_DEBUG === "1") {
    console.log("[storage-debug:presigned-upload]", {
      key,
      bucket,
      publicUrl,
      signedUrl: signed.url
    });
  }

  return NextResponse.json({
    key,
    bucket,
    publicUrl,
    ...signed
  });
}
