import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { createPresignedUpload, getStorageBucketHint, resolveStoredFileUrl } from "@/lib/s3";
import { enforceRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  kind: z.enum(["audio", "cover"]).optional()
});

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

  const storageRoot = parsed.data.kind === "cover" ? "previews" : "uploads";
  const key = `${storageRoot}/${session.user.id}/${Date.now()}-${parsed.data.fileName}`;
  const signed = await createPresignedUpload({
    key,
    contentType: parsed.data.contentType
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
