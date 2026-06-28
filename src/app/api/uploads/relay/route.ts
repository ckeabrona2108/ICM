import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { uploadObjectToStorage } from "@/lib/s3";

function sanitizeStorageKey(rawValue: string | null): string | null {
  const value = (rawValue ?? "").trim().replace(/^\/+/u, "");
  if (!value) return null;
  const segments = value.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\")
    )
  ) {
    return null;
  }
  return segments.join("/");
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const key = sanitizeStorageKey(url.searchParams.get("key"));

  if (!key) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type")?.trim() || "application/octet-stream";
  const buffer = Buffer.from(await request.arrayBuffer());

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload body" }, { status: 400 });
  }

  try {
    const uploaded = await uploadObjectToStorage({
      key,
      body: buffer,
      contentType
    });

    return NextResponse.json({
      key: uploaded.key,
      bucket: uploaded.bucket,
      publicUrl: uploaded.url,
      url: uploaded.url
    });
  } catch (error) {
    console.error("[uploads-relay] upload failed", {
      key,
      contentType,
      message: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Не удалось загрузить файл в хранилище."
      },
      { status: 500 }
    );
  }
}
