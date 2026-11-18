import type { PrismaClient } from "@prisma/client";

import { deliverUserNotificationSafely, type UserNotificationEvent } from "@/lib/notification-delivery-service";
import { toNotificationStorageId } from "@/lib/notification-storage-id";
import { getReleaseLifecycleStatus } from "@/lib/release-counts";
import { isReleaseHiddenFromCabinet } from "@/lib/release-deletion-state";
import { getSceneShowcaseState } from "@/lib/scene-showcase-state";
import { isMergedResubmissionCopy } from "@/lib/release-timeline";

/**
 * Tips sent once after a release is approved, each only while it still helps:
 *  - day 2: make a vertical snippet for stories (and upload the showcase fragment if missing);
 *  - day 5: add lyrics / karaoke to tracks that have none.
 * Only releases approved within the tip window get them, so old catalogue is never messaged.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const SNIPPET_TIP_AFTER_DAYS = 2;
export const LYRICS_TIP_AFTER_DAYS = 5;
/** A tip that could not be sent in its window (server down, no approval date) is dropped. */
const TIP_WINDOW_DAYS = 10;

export interface ReleaseTipCandidate {
  id: string;
  userId: string;
  title: string | null;
  status: string;
  roles: unknown;
  tracks: ReadonlyArray<{ text: string | null; text_sync: string | null; instrumental: boolean | null }>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readApprovedAt(roles: unknown): Date | null {
  const value = asRecord(asRecord(roles)?.timeline)?.approvedAt;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const filled = (value: string | null | undefined) => Boolean(value?.trim());

function inWindow(approvedAt: Date, afterDays: number, now: Date): boolean {
  const start = approvedAt.getTime() + afterDays * DAY_MS;
  return now.getTime() >= start && now.getTime() < start + TIP_WINDOW_DAYS * DAY_MS;
}

/** The tips due now for these releases (before checking which were already sent). */
export function planReleaseTips(releases: ReadonlyArray<ReleaseTipCandidate>, now: Date): UserNotificationEvent[] {
  const events: UserNotificationEvent[] = [];
  for (const release of releases) {
    if (getReleaseLifecycleStatus(release.status, release.roles) !== "approved") continue;
    if (isMergedResubmissionCopy(release.roles) || isReleaseHiddenFromCabinet(release.roles)) continue;
    const approvedAt = readApprovedAt(release.roles);
    if (!approvedAt) continue;
    const title = release.title?.trim() || "Без названия";

    if (inWindow(approvedAt, SNIPPET_TIP_AFTER_DAYS, now)) {
      const hasShowcaseFragment = Boolean(getSceneShowcaseState(release.roles).previewAsset);
      events.push({
        id: `release-tip-snippet-${release.id}`,
        userId: release.userId,
        kind: "release_tip_snippet",
        title: "Сделайте сниппет для сторис",
        message: hasShowcaseFragment
          ? `Вертикальное видео с треком «${title}» для сторис, Reels и клипов VK собирается в Snippet Studio за пару минут.`
          : `Вертикальное видео с треком «${title}» для сторис, Reels и клипов VK собирается в Snippet Studio за пару минут. И загрузите 30-секундный фрагмент — релиз попадёт на витрину.`,
        href: "/dashboard/video-snippets"
      });
    }

    if (inWindow(approvedAt, LYRICS_TIP_AFTER_DAYS, now)) {
      const vocalTracks = release.tracks.filter((track) => !track.instrumental);
      const withoutLyrics = vocalTracks.filter((track) => !filled(track.text)).length;
      const withoutKaraoke = vocalTracks.filter((track) => !filled(track.text_sync)).length;
      if (vocalTracks.length > 0 && (withoutLyrics > 0 || withoutKaraoke > 0)) {
        events.push({
          id: `release-tip-lyrics-${release.id}`,
          userId: release.userId,
          kind: "release_tip_lyrics",
          title: withoutLyrics > 0 ? "Добавьте текст и караоке" : "Добавьте караоке",
          message: withoutLyrics > 0
            ? `С текстом и караоке «${title}» показывается со словами в Яндекс Музыке, VK и Apple Music — так трек чаще досматривают и поют. Добавить можно через «Редактировать» у релиза.`
            : `Текст у «${title}» уже есть. Добавьте караоке (синхронный текст) — строки будут подсвечиваться в такт в Яндекс Музыке, VK и Apple Music. Добавить можно через «Редактировать» у релиза.`,
          href: `/dashboard/releases/${encodeURIComponent(release.id)}/edit`
        });
      }
    }
  }
  return events;
}

/** Daily: sends the tips due now, each tip at most once per release. */
export async function runReleaseTipsJob(prisma: PrismaClient, now = new Date()): Promise<{ sent: number }> {
  const since = new Date(now.getTime() - (LYRICS_TIP_AFTER_DAYS + TIP_WINDOW_DAYS + 1) * DAY_MS);
  const releases = await prisma.release.findMany({
    where: { status: "approved", confirmed: true },
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      roles: true,
      track: { select: { text: true, text_sync: true, instrumental: true } }
    }
  });
  const recent = releases.filter((release) => {
    const approvedAt = readApprovedAt(release.roles);
    return approvedAt !== null && approvedAt >= since;
  });
  const events = planReleaseTips(
    recent.map((release) => ({ ...release, tracks: release.track })),
    now
  );
  if (events.length === 0) return { sent: 0 };

  const storageIds = events.map((event) => toNotificationStorageId(event.id));
  const alreadySent = new Set(
    (await prisma.ai_user_notifications.findMany({ where: { id: { in: storageIds } }, select: { id: true } }))
      .map((row) => row.id)
  );
  let sent = 0;
  for (const event of events) {
    if (alreadySent.has(toNotificationStorageId(event.id))) continue;
    await deliverUserNotificationSafely(prisma, event);
    sent += 1;
  }
  return { sent };
}
