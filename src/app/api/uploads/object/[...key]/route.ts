import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";

const LOCAL_STORAGE_ROOT = path.join(process.cwd(), ".tmp", "local-object-storage");

function sanitizeKeySegments(segments: string[] | undefined): string[] | null {
  if (!segments || segments.length === 0) return null;
  const decoded = segments.map((segment) => decodeURIComponent(segment));
  if (
    decoded.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\")
    )
  ) {
    return null;
  }
  return decoded;
}

function resolveObjectPaths(segments: string[]) {
  const relativePath = path.join(...segments);
  const filePath = path.join(LOCAL_STORAGE_ROOT, relativePath);
  const metaPath = `${filePath}.meta.json`;
  return { filePath, metaPath };
}

function inferContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".flac") return "audio/flac";
  if (extension === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

export async function PUT(
  request: Request,
  context: { params: { key?: string[] } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const segments = sanitizeKeySegments(context.params.key);
  if (!segments) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  const { filePath, metaPath } = resolveObjectPaths(segments);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        contentType: request.headers.get("content-type") || inferContentType(filePath)
      },
      null,
      2
    ),
    "utf8"
  );

  return new NextResponse(null, { status: 200 });
}

export async function GET(
  request: Request,
  context: { params: { key?: string[] } }
) {
  const segments = sanitizeKeySegments(context.params.key);
  if (!segments) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  const { filePath, metaPath } = resolveObjectPaths(segments);

  try {
    await stat(filePath);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const body = await readFile(filePath);
  let contentType = inferContentType(filePath);

  try {
    const metaRaw = await readFile(metaPath, "utf8");
    const meta = JSON.parse(metaRaw) as { contentType?: string };
    if (typeof meta.contentType === "string" && meta.contentType.trim()) {
      contentType = meta.contentType.trim();
    }
  } catch {
    // Metadata is optional for local debug storage.
  }

  const url = new URL(request.url);
  const response = new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": url.searchParams.get("contentType") || contentType,
      "Cache-Control": "private, max-age=60"
    }
  });

  const contentDisposition = url.searchParams.get("contentDisposition");
  if (contentDisposition) {
    response.headers.set("Content-Disposition", contentDisposition);
  }

  return response;
}
