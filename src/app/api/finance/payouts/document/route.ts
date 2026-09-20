import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { streamStoredObject, uploadObjectToStorage } from "@/lib/s3";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png"
};

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_").replace(/^\.+/u, "").slice(0, 120) || "document";
}

function isOwnerDocumentKey(key: string, userId: string): boolean {
  return key.startsWith(`private/payout-documents/${userId}/`);
}

function contentMatchesType(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "application/pdf") {
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  }
  if (contentType === "image/png") {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit({
    key: `finance:payout-document:${session.user.id}`,
    limit: 12,
    windowMs: 10 * 60_000
  });
  if (limited) return limited;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Выберите документ для загрузки." }, { status: 400 });
  }
  if (!ALLOWED_DOCUMENT_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "Поддерживаются PDF, JPG и PNG размером до 10 МБ." }, { status: 415 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!contentMatchesType(bytes, file.type)) {
    return NextResponse.json({ error: "Тип документа не соответствует содержимому файла." }, { status: 415 });
  }
  const extension = EXTENSIONS[file.type];
  const fileName = safeFileName(file.name).replace(/\.[^.]+$/u, "") || "document";
  const key = `private/payout-documents/${session.user.id}/${randomUUID()}-${fileName}.${extension}`;
  try {
    await uploadObjectToStorage({
      key,
      body: bytes,
      contentType: file.type
    });
    return NextResponse.json({
      key,
      name: safeFileName(file.name),
      size: file.size,
      contentType: file.type
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Не удалось безопасно загрузить документ." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const mayRead = session.user.role === "ADMIN" || isOwnerDocumentKey(key, session.user.id);
  if (!mayRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stored = await streamStoredObject({ key }).catch(() => null);
  if (!stored) return NextResponse.json({ error: "Документ не найден." }, { status: 404 });
  return new NextResponse(stored.body, {
    headers: {
      "Content-Type": stored.contentType ?? "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
