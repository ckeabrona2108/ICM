import { createHash } from "node:crypto";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import {
  artistProfileInputSchema,
  saveUserArtistProfileSettings
} from "@/lib/artist-profile-service";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { uploadObjectToStorage } from "@/lib/s3";
import { validateAvatarDataUrl } from "@/lib/user-profile-policy";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  artistKey: z.string().trim().min(1),
  settings: artistProfileInputSchema,
  imageDataUrl: z.string().min(1)
});

function parseImage(dataUrl: string) {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl.trim());
  if (!match) throw new Error("INVALID_BACKGROUND");
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  const mimeType = match[1].toLowerCase();
  const extension = extensions[mimeType];
  if (!extension) throw new Error("INVALID_BACKGROUND");
  return { mimeType, extension, body: Buffer.from(match[2], "base64") };
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id?.trim();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit({
    key: `artist-profile:background:${userId}`,
    limit: 10,
    windowMs: 60 * 60_000
  });
  if (limited) return limited;

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте изображение и настройки профиля" }, { status: 400 });
  }

  const validation = validateAvatarDataUrl(parsed.data.imageDataUrl, 5 * 1024 * 1024);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error ?? "Некорректный фон профиля" }, { status: 400 });
  }

  const image = parseImage(parsed.data.imageDataUrl);
  const profileHash = createHash("sha256").update(parsed.data.artistKey).digest("hex").slice(0, 20);
  const storageKey = `artist-profiles/${userId}/background-${profileHash}.${image.extension}`;

  try {
    const uploaded = await uploadObjectToStorage({
      key: storageKey,
      body: image.body,
      contentType: image.mimeType
    });
    const settings = { ...parsed.data.settings, backgroundKey: uploaded.key };
    return NextResponse.json(await saveUserArtistProfileSettings(
      prisma,
      userId,
      parsed.data.artistKey,
      settings
    ));
  } catch (error) {
    console.error("[artist-profile-background] upload failed", error);
    return NextResponse.json(
      { error: "Хранилище изображений временно недоступно. Повторите позже." },
      { status: 503 }
    );
  }
}
