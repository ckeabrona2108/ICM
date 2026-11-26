import { z } from "zod";

/**
 * Structured "Релиз и модерация" requests in support.
 *
 * The artist picks one of their releases and a request type; the ticket keeps a snapshot of the
 * release (title, artist, UPC) so the admin sees it at once. The snapshot lives in the unused
 * `SupportTicket.description` column behind a marker, so no DB migration is needed.
 */

export const SUPPORT_RELEASE_REQUEST_TYPES = [
  {
    id: "move_to_card",
    title: "Перенести в другую карточку",
    hint: "Релиз попал не в ту карточку артиста",
    needsCardUrl: true,
    needsReleaseUrls: true,
    needsPlatforms: true
  },
  {
    id: "remove_from_card",
    title: "Убрать из карточки",
    hint: "Релиз появился в чужой карточке",
    needsCardUrl: true,
    needsReleaseUrls: true,
    needsPlatforms: true
  },
  {
    id: "missing_on_store",
    title: "Нет на витрине",
    hint: "Релиз не появился на площадке",
    needsCardUrl: false,
    needsReleaseUrls: false,
    needsPlatforms: true
  },
  {
    id: "other",
    title: "Другой вопрос",
    hint: "Опишите своими словами",
    needsCardUrl: false,
    needsReleaseUrls: false,
    needsPlatforms: false
  }
] as const;

export type SupportReleaseRequestType = (typeof SUPPORT_RELEASE_REQUEST_TYPES)[number]["id"];

export const SUPPORT_RELEASE_PLATFORMS = [
  "Яндекс Музыка",
  "VK Музыка",
  "Звук",
  "МТС Музыка",
  "Apple Music",
  "Spotify",
  "YouTube Music",
  "Deezer",
  "TikTok",
  "Другая"
] as const;

export type SupportReleasePlatform = (typeof SUPPORT_RELEASE_PLATFORMS)[number];

/** Example addresses so the artist sees which link we expect for each store. */
export const SUPPORT_PLATFORM_LINK_HINTS: Record<SupportReleasePlatform, { card: string; release: string }> = {
  "Яндекс Музыка": { card: "https://music.yandex.ru/artist/…", release: "https://music.yandex.ru/album/…" },
  "VK Музыка": { card: "https://vk.com/artist/…", release: "https://vk.com/music/album/…" },
  "Звук": { card: "https://zvuk.com/artist/…", release: "https://zvuk.com/release/…" },
  "МТС Музыка": { card: "https://music.mts.ru/artist/…", release: "https://music.mts.ru/album/…" },
  "Apple Music": { card: "https://music.apple.com/ru/artist/…", release: "https://music.apple.com/ru/album/…" },
  "Spotify": { card: "https://open.spotify.com/artist/…", release: "https://open.spotify.com/album/…" },
  "YouTube Music": { card: "https://music.youtube.com/channel/…", release: "https://music.youtube.com/playlist?list=…" },
  "Deezer": { card: "https://www.deezer.com/artist/…", release: "https://www.deezer.com/album/…" },
  "TikTok": { card: "https://www.tiktok.com/@…", release: "https://www.tiktok.com/music/…" },
  "Другая": { card: "https://…", release: "https://…" }
};

export const SUPPORT_RELEASE_TOPIC = "Релиз и модерация";

export function getSupportReleaseRequestType(id: string) {
  return SUPPORT_RELEASE_REQUEST_TYPES.find((type) => type.id === id) ?? null;
}

export interface SupportReleaseSnapshot {
  id: string;
  title: string;
  artist: string;
  upc: string | null;
  status: string;
  coverUrl: string | null;
}

/** Links for one store: the artist card and release links (meaning depends on the request type). */
export interface SupportPlatformLinks {
  platform: string;
  cardUrl: string | null;
  releaseUrls: string[];
}

export interface SupportReleaseContext {
  v: 1;
  requestType: SupportReleaseRequestType;
  release: SupportReleaseSnapshot;
  platforms: string[];
  /** One entry per selected platform that needs links (move / remove from card). */
  platformLinks: SupportPlatformLinks[];
}

const urlSchema = z
  .string()
  .trim()
  .max(500, "Ссылка слишком длинная.")
  .refine((value) => /^https?:\/\/\S+$/iu.test(value), "Ссылка должна начинаться с http:// или https://");

const platformLinksSchema = z.object({
  platform: z.enum(SUPPORT_RELEASE_PLATFORMS),
  cardUrl: z.union([urlSchema, z.literal("")]).default(""),
  releaseUrls: z.array(urlSchema).max(20, "Слишком много ссылок.").default([])
});

export const supportReleaseRequestSchema = z
  .object({
    releaseId: z.string().uuid("Выберите релиз."),
    requestType: z.enum(["move_to_card", "remove_from_card", "missing_on_store", "other"]),
    platforms: z.array(z.enum(SUPPORT_RELEASE_PLATFORMS)).max(SUPPORT_RELEASE_PLATFORMS.length).default([]),
    platformLinks: z.array(platformLinksSchema).max(SUPPORT_RELEASE_PLATFORMS.length).default([]),
    comment: z.string().trim().max(6000, "Сообщение слишком длинное.").default("")
  })
  .superRefine((value, ctx) => {
    const type = getSupportReleaseRequestType(value.requestType);
    if (!type) return;
    if (type.needsPlatforms && value.platforms.length === 0) {
      ctx.addIssue({ code: "custom", path: ["platforms"], message: "Выберите площадку." });
    }
    if (type.needsCardUrl) {
      for (const platform of value.platforms) {
        const links = value.platformLinks.find((item) => item.platform === platform);
        if (!links?.cardUrl) {
          ctx.addIssue({ code: "custom", path: ["platformLinks"], message: `${platform}: вставьте ссылку на карточку артиста.` });
          return;
        }
        if (type.id === "remove_from_card" && links.releaseUrls.length === 0) {
          ctx.addIssue({ code: "custom", path: ["platformLinks"], message: `${platform}: вставьте ссылку на релиз, который нужно убрать.` });
          return;
        }
      }
    }
    if (type.id === "other" && value.comment.length < 3) {
      ctx.addIssue({ code: "custom", path: ["comment"], message: "Опишите вопрос подробнее." });
    }
  });

export type SupportReleaseRequestInput = z.infer<typeof supportReleaseRequestSchema>;

/** Splits a textarea of links (one per line, or separated by spaces/commas) into a clean list. */
export function splitSupportLinks(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/u)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

/** Keeps links only for the selected platforms, in the order they were selected. */
export function pickSupportPlatformLinks(input: SupportReleaseRequestInput): SupportPlatformLinks[] {
  const type = getSupportReleaseRequestType(input.requestType);
  if (!type?.needsCardUrl && !type?.needsReleaseUrls) return [];
  return input.platforms.map((platform) => {
    const links = input.platformLinks.find((item) => item.platform === platform);
    return {
      platform,
      cardUrl: links?.cardUrl || null,
      releaseUrls: links?.releaseUrls ?? []
    };
  });
}

const CONTEXT_MARKER = "ICMCTX1:";

export function encodeSupportDescription(context: SupportReleaseContext, body: string): string {
  return `${CONTEXT_MARKER}${JSON.stringify(context)}\n${body}`;
}

export function parseSupportDescription(description: unknown): SupportReleaseContext | null {
  if (typeof description !== "string" || !description.startsWith(CONTEXT_MARKER)) return null;
  const newline = description.indexOf("\n");
  const json = description.slice(CONTEXT_MARKER.length, newline === -1 ? undefined : newline);
  try {
    const parsed = JSON.parse(json) as Partial<SupportReleaseContext> | null;
    if (!parsed || parsed.v !== 1 || !parsed.release?.id || !getSupportReleaseRequestType(String(parsed.requestType))) {
      return null;
    }
    return {
      v: 1,
      requestType: parsed.requestType as SupportReleaseRequestType,
      release: {
        id: String(parsed.release.id),
        title: String(parsed.release.title ?? ""),
        artist: String(parsed.release.artist ?? ""),
        upc: parsed.release.upc ? String(parsed.release.upc) : null,
        status: String(parsed.release.status ?? ""),
        coverUrl: parsed.release.coverUrl ? String(parsed.release.coverUrl) : null
      },
      platforms: Array.isArray(parsed.platforms) ? parsed.platforms.map(String) : [],
      platformLinks: Array.isArray(parsed.platformLinks)
        ? parsed.platformLinks.map((item) => ({
            platform: String(item?.platform ?? ""),
            cardUrl: item?.cardUrl ? String(item.cardUrl) : null,
            releaseUrls: Array.isArray(item?.releaseUrls) ? item.releaseUrls.map(String) : []
          }))
        : []
    };
  } catch {
    return null;
  }
}

export function buildSupportReleaseSubject(context: SupportReleaseContext): string {
  const type = getSupportReleaseRequestType(context.requestType);
  const subject = `${type?.title ?? SUPPORT_RELEASE_TOPIC} · «${context.release.title || "Без названия"}»`;
  return subject.length > 160 ? `${subject.slice(0, 157)}…` : subject;
}

export function supportReleaseLinksLabel(requestType: SupportReleaseRequestType) {
  return {
    card: requestType === "remove_from_card" ? "Карточка, где лишний релиз" : "Нужная карточка",
    release: requestType === "remove_from_card" ? "Убрать релизы" : "Ссылки на релиз"
  };
}

/** The first chat message: readable for the artist, the admin and the Telegram notification. */
export function buildSupportReleaseMessage(context: SupportReleaseContext, comment: string): string {
  const type = getSupportReleaseRequestType(context.requestType);
  const labels = supportReleaseLinksLabel(context.requestType);
  const lines = [
    `Запрос: ${type?.title ?? "Вопрос по релизу"}`,
    `Релиз: «${context.release.title || "Без названия"}»${context.release.artist ? ` — ${context.release.artist}` : ""}`,
    `UPC: ${context.release.upc || "ещё не присвоен"}`
  ];
  if (context.platforms.length) lines.push(`Площадки: ${context.platforms.join(", ")}`);
  for (const links of context.platformLinks) {
    if (!links.cardUrl && links.releaseUrls.length === 0) continue;
    lines.push("", `${links.platform}:`);
    if (links.cardUrl) lines.push(`${labels.card}: ${links.cardUrl}`);
    if (links.releaseUrls.length) lines.push(`${labels.release}:`, ...links.releaseUrls);
  }
  const text = comment.trim();
  if (text) lines.push("", text);
  return lines.join("\n");
}
