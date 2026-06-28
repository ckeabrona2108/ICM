import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getReleaseCoverAsset } from "@/lib/release-cover";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { getReleasePlatformLabel } from "@/lib/release-platforms";

type RecordLike = Record<string, unknown>;

export type SmartLinkTheme = "dark" | "light" | "auto";
export type SmartLinkPlatformStatus = "live" | "soon" | "hidden";

export interface SmartLinkPlatformConfig {
  code: string;
  label: string;
  status: SmartLinkPlatformStatus;
  url: string | null;
}

export interface SmartLinkFollowLinks {
  instagram: string;
  tiktok: string;
  telegram: string;
  youtube: string;
  vk: string;
  discord: string;
  website: string;
}

export interface SmartLinkVisitorEvent {
  at: string;
  type: "view" | "click";
  platform?: string;
  source: string;
  device: "mobile" | "desktop";
  country: string;
  city: string;
}

export interface SmartLinkAnalyticsState {
  totalViews: number;
  totalClicks: number;
  platformClicks: Record<string, number>;
  sourceClicks: Record<string, number>;
  countryClicks: Record<string, number>;
  cityClicks: Record<string, number>;
  deviceClicks: {
    mobile: number;
    desktop: number;
  };
  daily: Record<
    string,
    {
      views: number;
      clicks: number;
    }
  >;
  recentEvents: SmartLinkVisitorEvent[];
}

export interface SmartLinkState {
  theme: SmartLinkTheme;
  allowWaveDownload: boolean;
  platformLinks: Record<string, SmartLinkPlatformConfig>;
  followLinks: SmartLinkFollowLinks;
  analytics: SmartLinkAnalyticsState;
}

export interface SmartLinkOwnerView {
  releaseId: string;
  title: string;
  artist: string;
  publicSlug: string;
  publicUrl: string;
  theme: SmartLinkTheme;
  allowWaveDownload: boolean;
  coverUrl: string | null;
  releaseDate: string;
  genre: string;
  platforms: SmartLinkPlatformConfig[];
  followLinks: SmartLinkFollowLinks;
  analytics: SmartLinkAnalyticsState;
}

export interface SmartLinkPublicView extends SmartLinkOwnerView {
  explicit: boolean;
  waveDownloadUrl: string | null;
}

export interface SmartLinkOwnerUpdateInput {
  slug?: string;
  theme?: SmartLinkTheme;
  allowWaveDownload?: boolean;
  platforms?: Array<{
    code: string;
    url?: string | null;
    status?: SmartLinkPlatformStatus;
  }>;
  followLinks?: Partial<SmartLinkFollowLinks>;
}

const SMART_LINK_PLATFORM_ORDER = [
  "spotify",
  "apple_music",
  "yandex_music",
  "vk_music",
  "youtube_music",
  "deezer",
  "amazon_music",
  "tiktok"
] as const;

const SMART_LINK_FOLLOW_KEYS = [
  "instagram",
  "tiktok",
  "telegram",
  "youtube",
  "vk",
  "discord",
  "website"
] as const;

type SmartLinkPlatformCode = (typeof SMART_LINK_PLATFORM_ORDER)[number];
type SmartLinkFollowKey = (typeof SMART_LINK_FOLLOW_KEYS)[number];

function asRecord(value: unknown): RecordLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RecordLike;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function toIsoDate(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64) || "release";
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function getDefaultFollowLinks(user: {
  telegram?: string | null;
  vk?: string | null;
  personalSiteUrl?: string | null;
}): SmartLinkFollowLinks {
  return {
    instagram: "",
    tiktok: "",
    telegram: user.telegram?.trim() || "",
    youtube: "",
    vk: user.vk?.trim() || "",
    discord: "",
    website: user.personalSiteUrl?.trim() || ""
  };
}

function getDefaultAnalytics(): SmartLinkAnalyticsState {
  return {
    totalViews: 0,
    totalClicks: 0,
    platformClicks: {},
    sourceClicks: {},
    countryClicks: {},
    cityClicks: {},
    deviceClicks: {
      mobile: 0,
      desktop: 0
    },
    daily: {},
    recentEvents: []
  };
}

function normalizePlatformStatus(value: unknown): SmartLinkPlatformStatus {
  return value === "live" || value === "hidden" ? value : "soon";
}

function normalizeFollowLinks(value: unknown, defaults: SmartLinkFollowLinks): SmartLinkFollowLinks {
  const source = asRecord(value);
  const next = { ...defaults };
  if (!source) return next;
  for (const key of SMART_LINK_FOLLOW_KEYS) {
    next[key] = asString(source[key]) ?? defaults[key];
  }
  return next;
}

function normalizeAnalytics(value: unknown): SmartLinkAnalyticsState {
  const source = asRecord(value);
  if (!source) return getDefaultAnalytics();
  const deviceSource = asRecord(source.deviceClicks);
  const recentEvents = Array.isArray(source.recentEvents)
    ? source.recentEvents
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((item): SmartLinkVisitorEvent => ({
          at: asString(item?.at) ?? new Date().toISOString(),
          type: item?.type === "click" ? "click" : "view",
          platform: asString(item?.platform) ?? undefined,
          source: asString(item?.source) ?? "Direct",
          device: item?.device === "mobile" ? "mobile" : "desktop",
          country: asString(item?.country) ?? "Unknown",
          city: asString(item?.city) ?? "Unknown"
        }))
    : [];

  return {
    totalViews: typeof source.totalViews === "number" ? source.totalViews : 0,
    totalClicks: typeof source.totalClicks === "number" ? source.totalClicks : 0,
    platformClicks: asRecord(source.platformClicks) as Record<string, number> ?? {},
    sourceClicks: asRecord(source.sourceClicks) as Record<string, number> ?? {},
    countryClicks: asRecord(source.countryClicks) as Record<string, number> ?? {},
    cityClicks: asRecord(source.cityClicks) as Record<string, number> ?? {},
    deviceClicks: {
      mobile: typeof deviceSource?.mobile === "number" ? deviceSource.mobile : 0,
      desktop: typeof deviceSource?.desktop === "number" ? deviceSource.desktop : 0
    },
    daily: asRecord(source.daily) as SmartLinkAnalyticsState["daily"] ?? {},
    recentEvents: recentEvents.slice(0, 25)
  };
}

function normalizeSelectedPlatforms(roles: unknown): string[] {
  const root = asRecord(roles);
  const submission = asRecord(root?.submissionData);
  const raw = submission?.platforms;
  if (!Array.isArray(raw)) return [...SMART_LINK_PLATFORM_ORDER];
  return unique(
    raw
      .map((item) => asString(item))
      .filter(Boolean)
      .filter((item): item is string => SMART_LINK_PLATFORM_ORDER.includes(item as SmartLinkPlatformCode))
  );
}

function normalizePlatformLinks(
  value: unknown,
  selectedCodes: string[]
): Record<string, SmartLinkPlatformConfig> {
  const source = asRecord(value);
  const next: Record<string, SmartLinkPlatformConfig> = {};
  const effectiveCodes = unique(
    [...SMART_LINK_PLATFORM_ORDER.filter((code) => selectedCodes.includes(code)), ...selectedCodes]
      .filter((code): code is string => Boolean(code))
  );

  for (const code of effectiveCodes) {
    const item = source ? asRecord(source[code]) : null;
    const url = asString(item?.url);
    const status = normalizePlatformStatus(item?.status ?? (url ? "live" : "soon"));
    next[code] = {
      code,
      label: getReleasePlatformLabel(code),
      url,
      status: !url && status !== "hidden" ? "soon" : url && status === "soon" ? "live" : status
    };
  }

  return next;
}

function readSmartLinkState(
  roles: unknown,
  userDefaults: SmartLinkFollowLinks,
  selectedCodes: string[]
): SmartLinkState {
  const root = asRecord(roles);
  const raw = asRecord(root?.smartLink);
  return {
    theme: raw?.theme === "light" || raw?.theme === "auto" ? raw.theme : "dark",
    allowWaveDownload: asBoolean(raw?.allowWaveDownload) ?? false,
    platformLinks: normalizePlatformLinks(raw?.platformLinks, selectedCodes),
    followLinks: normalizeFollowLinks(raw?.followLinks, userDefaults),
    analytics: normalizeAnalytics(raw?.analytics)
  };
}

function writeSmartLinkState(roles: unknown, nextState: SmartLinkState): Prisma.InputJsonValue {
  const root = asRecord(roles) ? structuredClone(roles as Record<string, unknown>) : {};
  (root as Record<string, unknown>).smartLink = nextState as unknown as Prisma.InputJsonValue;
  return root as Prisma.InputJsonValue;
}

function deriveArtistName(input: {
  performer?: string | null;
  userName?: string | null;
  roles?: unknown;
}): string {
  const submission = asRecord(asRecord(input.roles)?.submissionData);
  return (
    asString(submission?.performer) ??
    asString(input.performer) ??
    asString(input.userName) ??
    "ICECREAMMUSIC Artist"
  );
}

function deriveExplicit(input: {
  tracks: Array<{ explicit?: boolean | null }>;
  roles?: unknown;
}): boolean {
  if (input.tracks.some((track) => track.explicit === true)) return true;
  const submission = asRecord(asRecord(input.roles)?.submissionData);
  const rawTracks = Array.isArray(submission?.tracks) ? submission?.tracks : [];
  return rawTracks.some((item) => asRecord(item)?.explicit === true);
}

function buildWaveDownloadUrl(input: {
  allowWaveDownload: boolean;
  roles?: unknown;
}): string | null {
  if (!input.allowWaveDownload) return null;
  const submission = asRecord(asRecord(input.roles)?.submissionData);
  const tracks = Array.isArray(submission?.tracks) ? submission.tracks : [];
  const firstTrack = asRecord(tracks[0]);
  if (!firstTrack) return null;
  const candidates = [
    firstTrack.audioFile,
    firstTrack.audioUpload,
    firstTrack.audioUrl,
    firstTrack.audio,
    firstTrack.track
  ];
  for (const candidate of candidates) {
    const url = buildStoredFileRouteUrl(candidate) ?? asString(asRecord(candidate)?.url) ?? asString(candidate);
    if (url) return url;
  }
  return null;
}

function ensurePlatformOrder(platformLinks: Record<string, SmartLinkPlatformConfig>): SmartLinkPlatformConfig[] {
  const ordered: SmartLinkPlatformConfig[] = [];
  for (const code of SMART_LINK_PLATFORM_ORDER) {
    const item = platformLinks[code];
    if (item) ordered.push(item);
  }
  return ordered;
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function classifyDevice(userAgent: string | null): "mobile" | "desktop" {
  if (!userAgent) return "desktop";
  return /iphone|android|mobile|ipad|ipod/iu.test(userAgent) ? "mobile" : "desktop";
}

function deriveSource(params: {
  utmSource?: string | null;
  referrer?: string | null;
}): string {
  const utmSource = params.utmSource?.trim();
  if (utmSource) return utmSource;
  const referrer = params.referrer?.trim();
  if (!referrer) return "Direct";
  try {
    const hostname = new URL(referrer).hostname.replace(/^www\./, "");
    if (hostname.includes("instagram")) return "Instagram";
    if (hostname.includes("tiktok")) return "TikTok";
    if (hostname.includes("telegram")) return "Telegram";
    if (hostname.includes("vk")) return "VK";
    if (hostname.includes("facebook")) return "Facebook";
    if (hostname.includes("google")) return "Google";
    return hostname;
  } catch {
    return "Direct";
  }
}

async function buildOwnerViewFromRelease(params: {
  promoLink: { id: string; shortName: string; releaseId: string };
  release: {
    id: string;
    title: string;
    performer: string | null;
    preview: string;
    date: Date;
    genre: string;
    roles: unknown;
    status: string;
    confirmed: boolean;
    upc: string | null;
    userId: string;
    user: {
      name: string;
      telegram: string | null;
      vk: string | null;
      personalSiteUrl: string | null;
    };
    track: Array<{ explicit: boolean | null }>;
  };
}): Promise<SmartLinkOwnerView> {
  const artist = deriveArtistName({
    performer: params.release.performer,
    userName: params.release.user.name,
    roles: params.release.roles
  });
  const selectedPlatformCodes = normalizeSelectedPlatforms(params.release.roles);
  const state = readSmartLinkState(
    params.release.roles,
    getDefaultFollowLinks(params.release.user),
    selectedPlatformCodes
  );
  const cover = await getReleaseCoverAsset({
    id: params.release.id,
    preview: params.release.preview,
    roles: params.release.roles,
    userId: params.release.userId,
    title: params.release.title
  });

  return {
    releaseId: params.release.id,
    title: params.release.title,
    artist,
    publicSlug: params.promoLink.shortName,
    publicUrl: `${getBaseUrl()}/l/${params.promoLink.shortName}`,
    theme: state.theme,
    allowWaveDownload: state.allowWaveDownload,
    coverUrl: cover.url,
    releaseDate: toIsoDate(params.release.date),
    genre: params.release.genre,
    platforms: ensurePlatformOrder(state.platformLinks),
    followLinks: state.followLinks,
    analytics: state.analytics
  };
}

async function getPromoLinkBySlug(slug: string) {
  return prisma.promo_links.findFirst({
    where: {
      shortName: slug
    },
    include: {
      release: {
        include: {
          user: {
            select: {
              name: true,
              telegram: true,
              vk: true,
              personalSiteUrl: true
            }
          },
          track: {
            select: {
              explicit: true
            },
            orderBy: {
              index: "asc"
            }
          }
        }
      }
    }
  });
}

function deriveReleaseSmartLinkCandidates(input: {
  title: string;
  performer: string | null;
  userName: string | null;
  roles: unknown;
}): string[] {
  const artist = deriveArtistName({
    performer: input.performer,
    userName: input.userName,
    roles: input.roles
  });
  const rawCandidates = [
    slugify(input.title),
    slugify(`${artist}-${input.title}`),
    slugify(`${input.title}-${artist}`)
  ].filter(Boolean);

  return unique(
    rawCandidates.flatMap((candidate) => {
      const compact = candidate.replace(/-/g, "");
      return compact && compact !== candidate ? [candidate, compact] : [candidate];
    })
  );
}

async function getPromoLinkBySlugWithFallback(slug: string) {
  const existing = await getPromoLinkBySlug(slug);
  if (existing) return existing;

  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      performer: true,
      preview: true,
      date: true,
      genre: true,
      roles: true,
      status: true,
      confirmed: true,
      upc: true,
      userId: true,
      user: {
        select: {
          name: true,
          telegram: true,
          vk: true,
          personalSiteUrl: true
        }
      },
      track: {
        select: {
          explicit: true
        },
        orderBy: {
          index: "asc"
        }
      }
    }
  });

  for (const release of releases) {
    if (
      !shouldTreatReleaseAsApproved({
        status: release.status,
        confirmed: release.confirmed,
        upc: release.upc,
        roles: release.roles
      })
    ) {
      continue;
    }

    const candidates = deriveReleaseSmartLinkCandidates({
      title: release.title,
      performer: release.performer,
      userName: release.user.name,
      roles: release.roles
    });

    if (!candidates.includes(slug)) {
      continue;
    }

    const promoLinkByRelease = await getPromoLinkByReleaseId(release.id);
    if (promoLinkByRelease) {
      if (promoLinkByRelease.shortName === slug) {
        return await getPromoLinkBySlug(slug);
      }
      return getPromoLinkBySlug(promoLinkByRelease.shortName);
    }

    try {
      await prisma.promo_links.create({
        data: {
          shortName: slug,
          releaseId: release.id
        }
      });
    } catch {
      return getPromoLinkBySlug(slug);
    }

    return getPromoLinkBySlug(slug);
  }

  return null;
}

async function getPromoLinkByReleaseId(releaseId: string) {
  return prisma.promo_links.findFirst({
    where: {
      releaseId
    }
  });
}

async function buildUniquePromoSlug(baseSlug: string): Promise<string> {
  let candidate = baseSlug;
  let counter = 2;
  while (await prisma.promo_links.findFirst({ where: { shortName: candidate }, select: { id: true } })) {
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
  return candidate;
}

export async function ensureSmartLinkForRelease(params: {
  userId: string;
  releaseId: string;
}): Promise<SmartLinkOwnerView | null> {
  const release = await prisma.release.findFirst({
    where: {
      id: params.releaseId,
      userId: params.userId
    },
    include: {
      user: {
        select: {
          name: true,
          telegram: true,
          vk: true,
          personalSiteUrl: true
        }
      },
      track: {
        select: {
          explicit: true
        },
        orderBy: {
          index: "asc"
        }
      }
    }
  });

  if (!release) return null;

  let promoLink = await getPromoLinkByReleaseId(release.id);
  if (!promoLink) {
    const artist = deriveArtistName({
      performer: release.performer,
      userName: release.user.name,
      roles: release.roles
    });
    const slug = await buildUniquePromoSlug(slugify(`${artist}-${release.title}`));
    promoLink = await prisma.promo_links.create({
      data: {
        shortName: slug,
        releaseId: release.id
      }
    });
  }

  return buildOwnerViewFromRelease({
    promoLink,
    release
  });
}

export async function getSmartLinkOwnerView(params: {
  userId: string;
  releaseId: string;
}): Promise<SmartLinkOwnerView | null> {
  return ensureSmartLinkForRelease(params);
}

export async function getSmartLinksByUser(userId: string): Promise<SmartLinkOwnerView[]> {
  const releases = await prisma.release.findMany({
    where: {
      userId
    },
    include: {
      user: {
        select: {
          name: true,
          telegram: true,
          vk: true,
          personalSiteUrl: true
        }
      },
      track: {
        select: {
          explicit: true
        },
        orderBy: {
          index: "asc"
        }
      }
    },
    orderBy: {
      date: "desc"
    }
  });

  const items: SmartLinkOwnerView[] = [];

  for (const release of releases) {
    if (
      !shouldTreatReleaseAsApproved({
        status: release.status,
        confirmed: release.confirmed,
        upc: release.upc,
        roles: release.roles
      })
    ) {
      continue;
    }

    let promoLink = await getPromoLinkByReleaseId(release.id);
    if (!promoLink) {
      const artist = deriveArtistName({
        performer: release.performer,
        userName: release.user.name,
        roles: release.roles
      });
      const slug = await buildUniquePromoSlug(slugify(`${artist}-${release.title}`));
      promoLink = await prisma.promo_links.create({
        data: {
          shortName: slug,
          releaseId: release.id
        }
      });
    }

    items.push(
      await buildOwnerViewFromRelease({
        promoLink,
        release
      })
    );
  }

  return items;
}

export async function updateSmartLinkOwnerSettings(params: {
  userId: string;
  releaseId: string;
  input: SmartLinkOwnerUpdateInput;
}): Promise<SmartLinkOwnerView | null> {
  const ownerView = await ensureSmartLinkForRelease({
    userId: params.userId,
    releaseId: params.releaseId
  });
  if (!ownerView) return null;

  const release = await prisma.release.findFirst({
    where: {
      id: params.releaseId,
      userId: params.userId
    },
    include: {
      user: {
        select: {
          name: true,
          telegram: true,
          vk: true,
          personalSiteUrl: true
        }
      },
      track: {
        select: {
          explicit: true
        },
        orderBy: {
          index: "asc"
        }
      }
    }
  });
  if (!release) return null;

  const selectedPlatformCodes = normalizeSelectedPlatforms(release.roles);
  const currentState = readSmartLinkState(
    release.roles,
    getDefaultFollowLinks(release.user),
    selectedPlatformCodes
  );
  const nextState: SmartLinkState = {
    ...currentState,
    theme: params.input.theme ?? currentState.theme,
    allowWaveDownload: params.input.allowWaveDownload ?? currentState.allowWaveDownload,
    followLinks: {
      ...currentState.followLinks,
      ...params.input.followLinks
    },
    platformLinks: { ...currentState.platformLinks }
  };

  for (const item of params.input.platforms ?? []) {
    if (!SMART_LINK_PLATFORM_ORDER.includes(item.code as SmartLinkPlatformCode)) continue;
    const current = nextState.platformLinks[item.code] ?? {
      code: item.code,
      label: getReleasePlatformLabel(item.code),
      status: "soon" as SmartLinkPlatformStatus,
      url: null
    };
    const url = item.url === undefined ? current.url : (item.url?.trim() || null);
    const status = item.status ?? (url ? "live" : current.status);
    nextState.platformLinks[item.code] = {
      ...current,
      url,
      status: !url && status !== "hidden" ? "soon" : url && status === "soon" ? "live" : status
    };
  }

  if (params.input.slug) {
    const nextSlug = slugify(params.input.slug);
    const existingPromo = await prisma.promo_links.findFirst({
      where: {
        shortName: nextSlug
      }
    });
    if (existingPromo && existingPromo.releaseId !== params.releaseId) {
      throw new Error("SLUG_ALREADY_EXISTS");
    }
    await prisma.promo_links.updateMany({
      where: {
        releaseId: params.releaseId
      },
      data: {
        shortName: nextSlug
      }
    });
  }

  await prisma.release.update({
    where: {
      id: params.releaseId
    },
    data: {
      roles: writeSmartLinkState(release.roles, nextState)
    }
  });

  return ensureSmartLinkForRelease({
    userId: params.userId,
    releaseId: params.releaseId
  });
}

export async function getSmartLinkPublicView(slug: string): Promise<SmartLinkPublicView | null> {
  const row = await getPromoLinkBySlugWithFallback(slug);
  if (!row) return null;
  const release = row.release;
  if (
    !shouldTreatReleaseAsApproved({
      status: release.status,
      confirmed: release.confirmed,
      upc: release.upc,
      roles: release.roles
    })
  ) {
    return null;
  }

  const ownerView = await buildOwnerViewFromRelease({
    promoLink: row,
    release
  });
  const state = readSmartLinkState(
    release.roles,
    getDefaultFollowLinks(release.user),
    normalizeSelectedPlatforms(release.roles)
  );

  return {
    ...ownerView,
    explicit: deriveExplicit({
      tracks: release.track,
      roles: release.roles
    }),
    waveDownloadUrl: buildWaveDownloadUrl({
      allowWaveDownload: state.allowWaveDownload,
      roles: release.roles
    })
  };
}

async function appendSmartLinkAnalyticsEvent(params: {
  releaseId: string;
  event: SmartLinkVisitorEvent;
  platformCode?: string;
}) {
  const release = await prisma.release.findUnique({
    where: {
      id: params.releaseId
    },
    select: {
      roles: true,
      user: {
        select: {
          telegram: true,
          vk: true,
          personalSiteUrl: true
        }
      }
    }
  });
  if (!release) return;

  const selectedPlatformCodes = normalizeSelectedPlatforms(release.roles);
  const state = readSmartLinkState(
    release.roles,
    getDefaultFollowLinks(release.user),
    selectedPlatformCodes
  );

  const nextAnalytics = structuredClone(state.analytics) as SmartLinkAnalyticsState;
  const key = todayKey(new Date(params.event.at));
  const day = nextAnalytics.daily[key] ?? { views: 0, clicks: 0 };
  if (params.event.type === "view") {
    nextAnalytics.totalViews += 1;
    day.views += 1;
  } else {
    nextAnalytics.totalClicks += 1;
    day.clicks += 1;
    if (params.platformCode) {
      nextAnalytics.platformClicks[params.platformCode] =
        (nextAnalytics.platformClicks[params.platformCode] ?? 0) + 1;
    }
  }

  nextAnalytics.daily[key] = day;
  nextAnalytics.sourceClicks[params.event.source] =
    (nextAnalytics.sourceClicks[params.event.source] ?? 0) + 1;
  nextAnalytics.countryClicks[params.event.country] =
    (nextAnalytics.countryClicks[params.event.country] ?? 0) + 1;
  nextAnalytics.cityClicks[params.event.city] =
    (nextAnalytics.cityClicks[params.event.city] ?? 0) + 1;
  nextAnalytics.deviceClicks[params.event.device] += 1;
  nextAnalytics.recentEvents = [params.event, ...nextAnalytics.recentEvents].slice(0, 25);

  await prisma.release.update({
    where: {
      id: params.releaseId
    },
    data: {
      roles: writeSmartLinkState(release.roles, {
        ...state,
        analytics: nextAnalytics
      })
    }
  });
}

export async function trackSmartLinkView(params: {
  slug: string;
  utmSource?: string | null;
  referrer?: string | null;
  country?: string | null;
  city?: string | null;
  userAgent?: string | null;
}) {
  const row = await getPromoLinkBySlugWithFallback(params.slug);
  if (!row) return;
  await appendSmartLinkAnalyticsEvent({
    releaseId: row.releaseId,
    event: {
      at: new Date().toISOString(),
      type: "view",
      source: deriveSource({
        utmSource: params.utmSource,
        referrer: params.referrer
      }),
      device: classifyDevice(params.userAgent ?? null),
      country: params.country?.trim() || "Unknown",
      city: params.city?.trim() || "Unknown"
    }
  });
}

export async function resolveSmartLinkRedirect(params: {
  slug: string;
  platformCode: string;
  utmSource?: string | null;
  referrer?: string | null;
  country?: string | null;
  city?: string | null;
  userAgent?: string | null;
}): Promise<string | null> {
  const row = await getPromoLinkBySlugWithFallback(params.slug);
  if (!row) return null;

  const selectedPlatformCodes = normalizeSelectedPlatforms(row.release.roles);
  const state = readSmartLinkState(
    row.release.roles,
    getDefaultFollowLinks(row.release.user),
    selectedPlatformCodes
  );
  const target = state.platformLinks[params.platformCode];
  if (!target || target.status !== "live" || !target.url) {
    return null;
  }

  await appendSmartLinkAnalyticsEvent({
    releaseId: row.releaseId,
    platformCode: params.platformCode,
    event: {
      at: new Date().toISOString(),
      type: "click",
      platform: params.platformCode,
      source: deriveSource({
        utmSource: params.utmSource,
        referrer: params.referrer
      }),
      device: classifyDevice(params.userAgent ?? null),
      country: params.country?.trim() || "Unknown",
      city: params.city?.trim() || "Unknown"
    }
  });

  return target.url;
}
