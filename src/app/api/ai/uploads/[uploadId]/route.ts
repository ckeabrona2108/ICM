import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { deleteStoredObject } from "@/lib/s3";

export async function DELETE(
  _request: Request,
  context: { params: { uploadId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = context.params;
  if (!uploadId) {
    return NextResponse.json({ error: "Upload id is required." }, { status: 400 });
  }

  try {
    const upload = await prisma.ai_uploads.findFirst({
      where: {
        id: uploadId,
        user_id: session.user.id
      },
      select: {
        id: true,
        storage_key: true
      }
    });

    if (!upload) {
      return NextResponse.json({ error: "Файл не найден." }, { status: 404 });
    }

    await prisma.ai_uploads.delete({
      where: {
        id: upload.id
      }
    });

    try {
      await deleteStoredObject({ key: upload.storage_key });
    } catch (storageError) {
      console.error("[ai-uploads] delete storage warning", {
        uploadId: upload.id,
        storageKey: upload.storage_key,
        error: storageError instanceof Error ? storageError.message : String(storageError ?? "unknown")
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["ai_uploads"])) {
      return NextResponse.json({ error: "Таблица ai_uploads недоступна в текущей базе." }, { status: 503 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось удалить загрузку." },
      { status: 500 }
    );
  }
}
