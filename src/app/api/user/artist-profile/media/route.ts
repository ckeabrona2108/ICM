import { randomUUID } from "node:crypto";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { sniffArtistSocialMedia } from "@/lib/media-signature";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { deleteStoredObject, uploadObjectToStorage } from "@/lib/s3";
import { isOwnedArtistSocialMediaKey } from "@/lib/social-post-media";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const limited = enforceRateLimit({ key: `artist-social-media:${userId}`, limit: 30, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const target = form?.get("target") === "comment" ? "comment" : "post";
  if (!(file instanceof File)) return NextResponse.json({ error: "Выберите файл" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffArtistSocialMedia(bytes);
  const mediaType = sniffed?.mediaType ?? null;
  if (!mediaType || (target === "comment" && mediaType !== "image")) {
    return NextResponse.json({ error: target === "comment" ? "К комментарию можно прикрепить JPG, PNG, WEBP или GIF" : "Поддерживаются изображения, аудио и видео" }, { status: 400 });
  }
  if (target === "post") {
    const allowed = sniffed?.mimeType === "image/png" || sniffed?.mimeType === "audio/mpeg" || sniffed?.mimeType === "video/mp4";
    if (!allowed) {
      return NextResponse.json({ error: "Для публикации доступны только PNG, MP3 и MP4" }, { status: 415 });
    }
  }
  const maxSize = mediaType === "image" ? 8 * 1024 * 1024 : mediaType === "audio" ? 25 * 1024 * 1024 : 80 * 1024 * 1024;
  if (file.size > maxSize) {
    const message = mediaType === "image"
      ? "Изображение должно быть не больше 8 МБ"
      : mediaType === "audio"
        ? "Аудио должно быть не больше 25 МБ"
        : "Видео должно быть не больше 80 МБ";
    return NextResponse.json({ error: message }, { status: 413 });
  }

  const extension = sniffed!.extension;
  const key = `artist-social/${userId}/${randomUUID()}.${extension}`;
  try {
    const uploaded = await uploadObjectToStorage({
      key,
      body: Buffer.from(bytes),
      contentType: sniffed!.mimeType
    });
    return NextResponse.json({
      mediaType,
      mediaKey: uploaded.key,
      mediaName: file.name.slice(0, 255),
      mediaUrl: buildStoredFileRouteUrl(uploaded.key)
    }, { status: 201 });
  } catch (error) {
    console.error("[artist-social-media] upload failed", error);
    return NextResponse.json({ error: "Хранилище временно недоступно" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const body = await request.json().catch(() => null) as { mediaKey?: unknown } | null;
  const mediaKey = typeof body?.mediaKey === "string" ? body.mediaKey.trim() : "";
  if (!isOwnedArtistSocialMediaKey(userId, mediaKey)) {
    return NextResponse.json({ error: "Вложение не принадлежит вашему аккаунту" }, { status: 403 });
  }

  const [postReferences, commentReferences] = await Promise.all([
    prisma.artist_profile_posts.count({
      where: {
        user_id: userId,
        OR: [{ media_key: mediaKey }, { content: { contains: mediaKey } }]
      }
    }),
    prisma.scene_release_comments.count({ where: { user_id: userId, media_key: mediaKey, deleted_at: null } })
  ]);
  if (postReferences + commentReferences > 0) {
    return NextResponse.json({ error: "Вложение уже используется в публикации" }, { status: 409 });
  }

  try {
    await deleteStoredObject({ key: mediaKey });
    return NextResponse.json({ deleted: true, mediaKey });
  } catch (error) {
    console.error("[artist-social-media] delete failed", error);
    return NextResponse.json({ error: "Не удалось удалить вложение" }, { status: 503 });
  }
}
