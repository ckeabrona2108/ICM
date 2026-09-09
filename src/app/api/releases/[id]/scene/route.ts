import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { notifyArtistFollowersAboutPublishedRelease } from "@/lib/artist-social-service";
import { prisma } from "@/lib/prisma";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { getReleaseCoverAsset } from "@/lib/release-cover";
import {
  getSceneShowcaseState,
  SCENE_PREVIEW_MAX_DURATION_SECONDS,
  SCENE_PREVIEW_MAX_SIZE_BYTES,
  withSceneShowcaseState
} from "@/lib/scene-showcase-state";
import { objectExists } from "@/lib/s3";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  enabled: z.boolean(),
  trackIndex: z.number().int().positive(),
  previewAsset: z.object({
    storageKey: z.string().trim().min(1),
    fileName: z.string().trim().min(1).max(180),
    contentType: z.string().trim().regex(/^audio\//u),
    size: z.number().int().positive().max(SCENE_PREVIEW_MAX_SIZE_BYTES),
    durationSec: z.number().positive().max(SCENE_PREVIEW_MAX_DURATION_SECONDS)
  }).nullable()
});

export async function GET(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const release = await prisma.release.findFirst({
    where: { id: context.params.id, userId: session.user.id },
    select: { roles: true }
  });
  if (!release) return NextResponse.json({ error: "Релиз не найден." }, { status: 404 });
  return NextResponse.json({ state: getSceneShowcaseState(release.roles) });
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Проверьте фрагмент." }, { status: 400 });
  }

  const release = await prisma.release.findFirst({
    where: { id: context.params.id, userId: session.user.id },
    select: {
      id: true,
      title: true,
      preview: true,
      status: true,
      confirmed: true,
      upc: true,
      roles: true,
      track: { select: { index: true } }
    }
  });
  if (!release) return NextResponse.json({ error: "Релиз не найден." }, { status: 404 });
  if (!shouldTreatReleaseAsApproved(release)) {
    return NextResponse.json({ error: "Витрина доступна после принятия релиза." }, { status: 409 });
  }
  if (!release.track.some((track) => track.index === parsed.data.trackIndex)) {
    return NextResponse.json({ error: "Выбранный трек не найден." }, { status: 400 });
  }

  if (!parsed.data.enabled) {
    const state = { ...getSceneShowcaseState(release.roles), enabled: false, publishedAt: null };
    await prisma.release.update({
      where: { id: release.id },
      data: { roles: withSceneShowcaseState(release.roles, state) }
    });
    return NextResponse.json({ ok: true, state });
  }

  const asset = parsed.data.previewAsset;
  if (!asset || !asset.storageKey.startsWith(`uploads/${session.user.id}/`)) {
    return NextResponse.json({ error: "Загрузите отдельный фрагмент длительностью до 30 секунд." }, { status: 400 });
  }
  const [cover, audioExists] = await Promise.all([
    getReleaseCoverAsset({
      id: release.id,
      userId: session.user.id,
      title: release.title,
      preview: release.preview,
      roles: release.roles
    }),
    objectExists(asset.storageKey)
  ]);
  if (!cover.url || cover.existsInS3 !== true) {
    return NextResponse.json({ error: "Для витрины нужна доступная обложка." }, { status: 409 });
  }
  if (audioExists === false || !asset.storageKey.toLowerCase().endsWith(".wav")) {
    return NextResponse.json({ error: "Не удалось подготовить WAV-фрагмент. Загрузите файл повторно." }, { status: 409 });
  }

  const state = {
    enabled: true,
    trackIndex: parsed.data.trackIndex,
    previewAsset: asset,
    publishedAt: new Date().toISOString()
  };
  await prisma.release.update({
    where: { id: release.id },
    data: { roles: withSceneShowcaseState(release.roles, state) }
  });
  if (!getSceneShowcaseState(release.roles).enabled) {
    try {
      await notifyArtistFollowersAboutPublishedRelease({
        prisma,
        profileUserId: session.user.id,
        releaseId: release.id,
        releaseTitle: release.title
      });
    } catch (error) {
      console.error("[scene-publish-notifications] failed", { releaseId: release.id, error });
    }
  }
  return NextResponse.json({ ok: true, state });
}
