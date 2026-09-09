import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { uploadObjectToStorage } from "@/lib/s3";
import { enforceRateLimit } from "@/lib/rate-limit";
import { handleAuthorizedStorageUpload } from "@/lib/storage-route-handlers";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = enforceRateLimit({
    key: `upload:relay:${session.user.id}`,
    limit: 30,
    windowMs: 10 * 60_000
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const rawKey = url.searchParams.get("key") ?? "";

  try {
    return await handleAuthorizedStorageUpload({
      request,
      rawKey,
      principalId: session.user.id,
      upload: async ({ key, bytes, contentType }) => uploadObjectToStorage({
        key,
        body: bytes,
        contentType
      }),
      success: (uploaded) => NextResponse.json({
        key: uploaded.key,
        bucket: uploaded.bucket,
        publicUrl: uploaded.url,
        url: uploaded.url
      })
    });
  } catch (error) {
    console.error("[uploads-relay] upload failed", {
      key: rawKey,
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
