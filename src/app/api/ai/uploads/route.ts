import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { resolveStoredFileUrl } from "@/lib/s3";

const createUploadSchema = z.object({
  section: z.enum(["image", "video", "audio"]),
  fileName: z.string().trim().min(1).max(255),
  storageKey: z.string().trim().min(1).max(2048),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(100 * 1024 * 1024)
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createUploadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid upload payload" },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.ai_uploads.create({
      data: {
        user_id: session.user.id,
        section: parsed.data.section,
        file_name: parsed.data.fileName,
        storage_key: parsed.data.storageKey,
        mime_type: parsed.data.mimeType,
        size_bytes: parsed.data.sizeBytes
      },
      select: {
        id: true,
        created_at: true,
        file_name: true,
        storage_key: true,
        mime_type: true,
        size_bytes: true,
        section: true
      }
    });

    return NextResponse.json({
      upload: {
        id: created.id,
        createdAt: created.created_at.toISOString(),
        fileName: created.file_name,
        storageKey: created.storage_key,
        url: resolveStoredFileUrl({ storageKey: created.storage_key }),
        mimeType: created.mime_type,
        sizeBytes: created.size_bytes,
        section: created.section
      }
    });
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["ai_uploads"])) {
      return NextResponse.json({ error: "Таблица ai_uploads недоступна в текущей базе." }, { status: 503 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить загрузку." },
      { status: 500 }
    );
  }
}
