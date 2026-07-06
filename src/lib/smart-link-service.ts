import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getReleaseCoverAsset } from "@/lib/release-cover";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import {
  getSmartLinkPlatformLabel,
  SMART_LINK_PRIMARY_PLATFORM_CODES,
  SMART_LINK_PLATFORM_CODES
} from "@/lib/smart-link-platforms";

type RecordLike = Record<string, unknown>;

export type SmartLinkTheme = "dark" | "light" | "auto";
export type SmartLinkPlatformStatus = "live" | "soon" | "hidden";

export interface SmartLinkPlatformConfig {
  code: string;
  label: string;
  status: SmartLinkPlatformStatus;
  url: string | null;
  order: number;
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

export interface SmartLinkNewsFeedLinks {
  vk: string;
}

export interface SmartLinkVideoEntry {
  id: string;
  title: string;
  url: string;
  enabled: boolean;
}

export interface SmartLinkCreditRow {
  id: string;
  name: string;
  role: string;
  link: string;
  enabled: boolean;
}

export interface SmartLinkCreditSection {
  key: string;
  title: string;
  description: string;
  rows: SmartLinkCreditRow[];
}

export interface SmartLinkContactEntry {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
}

export interface SmartLinkPixelEntry {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
}

export interface SmartLinkSectionVisibility {
  videos: boolean;
  credits: boolean;
  links: boolean;
  contacts: boolean;
  socials: boolean;
  newsFeed: boolean;
  pixels: boolean;
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
  platformOrder: string[];
  followLinks: SmartLinkFollowLinks;
  newsFeedLinks: SmartLinkNewsFeedLinks;
  sectionVisibility: SmartLinkSectionVisibility;
  coverVideoUrl: string;
  inlineVideos: SmartLinkVideoEntry[];
  creditSections: SmartLinkCreditSection[];
  contacts: SmartLinkContactEntry[];
  pixels: SmartLinkPixelEntry[];
  analytics: SmartLinkAnalyticsState;
}

export interface SmartLinkOwnerView {
  releaseId: string;
  title: string;
  artist: string;
  upc: string | null;
  publicSlug: string;
  publicUrl: string;
  theme: SmartLinkTheme;
  allowWaveDownload: boolean;
  coverUrl: string | null;
  releaseDate: string;
  genre: string;
  platforms: SmartLinkPlatformConfig[];
  followLinks: SmartLinkFollowLinks;
  newsFeedLinks: SmartLinkNewsFeedLinks;
  sectionVisibility: SmartLinkSectionVisibility;
  coverVideoUrl: string;
  inlineVideos: SmartLinkVideoEntry[];
  creditSections: SmartLinkCreditSection[];
  contacts: SmartLinkContactEntry[];
  pixels: SmartLinkPixelEntry[];
  analytics: SmartLinkAnalyticsState;
}

export interface SmartLinkNewsFeedWidget {
  provider: "vk";
  title: string;
  sourceUrl: string;
  embedUrl: string;
}

export interface SmartLinkNewsFeedPost {
  id: string;
  url: string;
  publishedAt: string;
  publishedLabel: string;
  text: string;
  imageUrl: string | null;
}

export interface SmartLinkPublicView extends SmartLinkOwnerView {
  explicit: boolean;
  waveDownloadUrl: string | null;
  newsFeedWidget: SmartLinkNewsFeedWidget | null;
  newsFeedPosts: SmartLinkNewsFeedPost[];
}

export interface SmartLinkOwnerUpdateInput {
  slug?: string;
  theme?: SmartLinkTheme;
  allowWaveDownload?: boolean;
  platforms?: Array<{
    code: string;
    url?: string | null;
    status?: SmartLinkPlatformStatus;
    order?: number;
  }>;
  followLinks?: Partial<SmartLinkFollowLinks>;
  newsFeedLinks?: Partial<SmartLinkNewsFeedLinks>;
  sectionVisibility?: Partial<SmartLinkSectionVisibility>;
  coverVideoUrl?: string | null;
  inlineVideos?: SmartLinkVideoEntry[];
  creditSections?: SmartLinkCreditSection[];
  contacts?: SmartLinkContactEntry[];
  pixels?: SmartLinkPixelEntry[];
}

const SMART_LINK_FOLLOW_KEYS = [
  "instagram",
  "tiktok",
  "telegram",
  "youtube",
  "vk",
  "discord",
  "website"
] as const;

type SmartLinkPlatformCode = (typeof SMART_LINK_PLATFORM_CODES)[number];

const VK_WIDGET_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";


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

function getDefaultFollowLinks(_user: {
  telegram?: string | null;
  vk?: string | null;
  personalSiteUrl?: string | null;
}): SmartLinkFollowLinks {
  return {
    instagram: "",
    tiktok: "",
    telegram: asString(_user.telegram) ?? "",
    youtube: "",
    vk: asString(_user.vk) ?? "",
    discord: "",
    website: asString(_user.personalSiteUrl) ?? ""
  };
}

function getDefaultNewsFeedLinks(): SmartLinkNewsFeedLinks {
  return {
    vk: ""
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

function getDefaultSectionVisibility(): SmartLinkSectionVisibility {
  return {
    videos: false,
    credits: false,
    links: false,
    contacts: false,
    socials: false,
    newsFeed: false,
    pixels: false
  };
}

function getDefaultCreditSections(): SmartLinkCreditSection[] {
  return [
    {
      key: "produced",
      title: "Produced",
      description: "Укажите авторов, чей вклад играет важную роль в релизе, к примеру: продюсер, композитор и тд.",
      rows: [{ id: "produced-1", name: "", role: "", link: "", enabled: true }]
    },
    {
      key: "sound",
      title: "Sound",
      description: "Укажите авторов, чей вклад играет важную роль в выбранном релизе — мастеринг, наименование студии и тд.",
      rows: [{ id: "sound-1", name: "", role: "", link: "", enabled: true }]
    },
    {
      key: "production_team",
      title: "Production team",
      description: "Укажите авторов, чей вклад играет важную роль в выбранном релизе — аранжировщик, remixer и тд.",
      rows: [{ id: "production-team-1", name: "", role: "", link: "", enabled: true }]
    },
    {
      key: "cover",
      title: "Cover",
      description: "Укажите авторов, чей вклад играет важную роль в выбранном релизе — дизайнер, фотограф и тд.",
      rows: [{ id: "cover-1", name: "", role: "", link: "", enabled: true }]
    },
    {
      key: "performer",
      title: "Performer",
      description: "Укажите авторов, чей вклад играет важную роль в выбранном релизе — вокал, бэк-вокал и тд.",
      rows: [{ id: "performer-1", name: "", role: "", link: "", enabled: true }]
    }
  ];
}

function getDefaultInlineVideos(): SmartLinkVideoEntry[] {
  return [{ id: "video-1", title: "", url: "", enabled: true }];
}

function getDefaultContacts(): SmartLinkContactEntry[] {
  return [{ id: "contact-1", label: "Контактный e-mail", value: "", enabled: true }];
}

function getDefaultPixels(): SmartLinkPixelEntry[] {
  return [
    { id: "pixel-1", label: "VK Pixel", value: "", enabled: true },
    { id: "pixel-2", label: "Meta Pixel", value: "", enabled: true }
  ];
}

function normalizeTheme(value: unknown): SmartLinkTheme {
  return value === "light" || value === "auto" ? value : "dark";
}

function normalizePlatformStatus(value: unknown): SmartLinkPlatformStatus {
  return value === "live" || value === "hidden" ? value : "soon";
}

function normalizeVideoEntries(value: unknown, fallback: SmartLinkVideoEntry[]): SmartLinkVideoEntry[] {
  if (!Array.isArray(value)) return fallback;
  const rows = value
    .map((item) => asRecord(item))
    .filter(Boolean)
    .map((item, index): SmartLinkVideoEntry => ({
      id: asString(item?.id) ?? `video-${index + 1}`,
      title: asString(item?.title) ?? "",
      url: asString(item?.url) ?? "",
      enabled: asBoolean(item?.enabled) ?? true
    }));
  return rows.length > 0 ? rows : fallback;
}

function normalizeCreditRows(value: unknown, fallbackPrefix: string): SmartLinkCreditRow[] {
  if (!Array.isArray(value)) {
    return [{ id: `${fallbackPrefix}-1`, name: "", role: "", link: "", enabled: true }];
  }
  const rows = value
    .map((item) => asRecord(item))
    .filter(Boolean)
    .map((item, index): SmartLinkCreditRow => ({
      id: asString(item?.id) ?? `${fallbackPrefix}-${index + 1}`,
      name: asString(item?.name) ?? "",
      role: asString(item?.role) ?? "",
      link: asString(item?.link) ?? "",
      enabled: asBoolean(item?.enabled) ?? true
    }));
  return rows.length > 0 ? rows : [{ id: `${fallbackPrefix}-1`, name: "", role: "", link: "", enabled: true }];
}

function normalizeCreditSections(value: unknown): SmartLinkCreditSection[] {
  const defaults = getDefaultCreditSections();
  const source = Array.isArray(value) ? value.map((item) => asRecord(item)).filter(Boolean) : [];
  return defaults.map((section) => {
    const existing = source.find((item) => asString(item?.key) === section.key);
    return {
      key: section.key,
      title: asString(existing?.title) ?? section.title,
      description: asString(existing?.description) ?? section.description,
      rows: normalizeCreditRows(existing?.rows, section.key)
    };
  });
}

function normalizeInfoEntries<T extends SmartLinkContactEntry | SmartLinkPixelEntry>(
  value: unknown,
  fallback: T[]
): T[] {
  if (!Array.isArray(value)) return fallback;
  const rows = value
    .map((item) => asRecord(item))
    .filter(Boolean)
    .map((item, index) => {
      const normalizedLabel = asString(item?.label) ?? fallback[index]?.label ?? "";
      const normalizedValue = asString(item?.value);
      return {
        id: asString(item?.id) ?? `${fallback[index]?.id ?? `item-${index + 1}`}`,
        label: normalizedLabel,
        value:
          normalizedValue && !["null", "undefined"].includes(normalizedValue.trim().toLowerCase())
            ? normalizedValue
            : "",
        enabled: asBoolean(item?.enabled) ?? true
      };
    })
    .filter((item) => item.label.trim().toLowerCase() !== "название лейбла") as T[];
  return rows.length > 0 ? rows : fallback;
}

function normalizeFollowLinks(value: unknown, defaults: SmartLinkFollowLinks): SmartLinkFollowLinks {
  const source = asRecord(value);
  const next = { ...defaults };
  if (!source) return next;
  for (const key of SMART_LINK_FOLLOW_KEYS) {
    const normalized = asString(source[key]);
    next[key] =
      normalized && !["null", "undefined"].includes(normalized.trim().toLowerCase())
        ? normalized
        : defaults[key];
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

function normalizeNewsFeedLinks(value: unknown): SmartLinkNewsFeedLinks {
  const source = asRecord(value);
  const defaults = getDefaultNewsFeedLinks();
  return {
    vk: asString(source?.vk) ?? defaults.vk
  };
}

function normalizeSectionVisibility(value: unknown): SmartLinkSectionVisibility {
  const source = asRecord(value);
  const defaults = getDefaultSectionVisibility();
  if (!source) return defaults;
  return {
    videos: asBoolean(source.videos) ?? defaults.videos,
    credits: asBoolean(source.credits) ?? defaults.credits,
    links: asBoolean(source.links) ?? defaults.links,
    contacts: asBoolean(source.contacts) ?? defaults.contacts,
    socials: asBoolean(source.socials) ?? defaults.socials,
    newsFeed: asBoolean(source.newsFeed) ?? defaults.newsFeed,
    pixels: asBoolean(source.pixels) ?? defaults.pixels
  };
}

function hasStoredSectionVisibility(value: unknown): boolean {
  const source = asRecord(value);
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, "sectionVisibility");
}

function normalizeSelectedPlatforms(roles: unknown): string[] {
  const root = asRecord(roles);
  const submission = asRecord(root?.submissionData);
  const raw = submission?.platforms;
  if (!Array.isArray(raw)) return [...SMART_LINK_PRIMARY_PLATFORM_CODES];
  return unique(
    raw
      .map((item) => asString(item))
      .filter(Boolean)
      .filter((item): item is string => SMART_LINK_PLATFORM_CODES.includes(item as SmartLinkPlatformCode))
  );
}

function normalizePlatformLinks(
  value: unknown,
  selectedCodes: string[]
): Record<string, SmartLinkPlatformConfig> {
  const source = asRecord(value);
  const next: Record<string, SmartLinkPlatformConfig> = {};
  const effectiveCodes = unique(
    [
      ...SMART_LINK_PRIMARY_PLATFORM_CODES,
      ...SMART_LINK_PLATFORM_CODES.filter((code) => selectedCodes.includes(code)),
      ...Object.keys(source ?? {}),
      ...selectedCodes
    ]
      .filter((code): code is string => Boolean(code))
  );

  for (const code of effectiveCodes) {
    const item = source ? asRecord(source[code]) : null;
    const url = asString(item?.url);
    const status = normalizePlatformStatus(item?.status ?? (url ? "live" : "soon"));
    next[code] = {
      code,
      label: getSmartLinkPlatformLabel(code),
      url,
      status: !url && status !== "hidden" ? "soon" : url && status === "soon" ? "live" : status,
      order: typeof item?.order === "number" ? item.order : effectiveCodes.indexOf(code)
    };
  }

  return next;
}

function normalizePlatformOrder(
  value: unknown,
  platformLinks: Record<string, SmartLinkPlatformConfig>,
  selectedCodes: string[]
): string[] {
  const explicit = Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter(Boolean)
        .filter((item): item is string => SMART_LINK_PLATFORM_CODES.includes(item as SmartLinkPlatformCode))
    : [];

  const byStoredOrder = Object.values(platformLinks)
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((item) => item.code);

  return unique(
    [...explicit, ...byStoredOrder, ...selectedCodes, ...SMART_LINK_PRIMARY_PLATFORM_CODES].filter(
      (code): code is string => Boolean(code) && Boolean(platformLinks[code])
    )
  );
}

function readSmartLinkState(
  roles: unknown,
  userDefaults: SmartLinkFollowLinks,
  selectedCodes: string[]
): SmartLinkState {
  const root = asRecord(roles);
  const raw = asRecord(root?.smartLink);
  const platformLinks = normalizePlatformLinks(raw?.platformLinks, selectedCodes);
  return {
    theme: normalizeTheme(raw?.theme),
    allowWaveDownload: asBoolean(raw?.allowWaveDownload) ?? false,
    platformLinks,
    platformOrder: normalizePlatformOrder(raw?.platformOrder, platformLinks, selectedCodes),
    followLinks: normalizeFollowLinks(raw?.followLinks, userDefaults),
    newsFeedLinks: normalizeNewsFeedLinks(raw?.newsFeedLinks),
    sectionVisibility: hasStoredSectionVisibility(raw)
      ? normalizeSectionVisibility(raw?.sectionVisibility)
      : getDefaultSectionVisibility(),
    coverVideoUrl: asString(raw?.coverVideoUrl) ?? "",
    inlineVideos: normalizeVideoEntries(raw?.inlineVideos, getDefaultInlineVideos()),
    creditSections: normalizeCreditSections(raw?.creditSections),
    contacts: normalizeInfoEntries(raw?.contacts, getDefaultContacts()),
    pixels: normalizeInfoEntries(raw?.pixels, getDefaultPixels()),
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

function ensurePlatformOrder(
  platformLinks: Record<string, SmartLinkPlatformConfig>,
  platformOrder: string[]
): SmartLinkPlatformConfig[] {
  const ordered: SmartLinkPlatformConfig[] = [];
  const codes = unique([
    ...platformOrder,
    ...SMART_LINK_PLATFORM_CODES,
    ...Object.keys(platformLinks)
  ]);

  for (const code of codes) {
    const item = platformLinks[code];
    if (item) ordered.push(item);
  }
  return ordered;
}

function extractVkDomainToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (!/(^|\.)vk\.com$/iu.test(parsed.hostname)) return null;
    const [segment = ""] = parsed.pathname.split("/").filter(Boolean);
    return segment || null;
  } catch {
    const normalized = trimmed
      .replace(/^https?:\/\/(?:m\.)?vk\.com\//iu, "")
      .replace(/^@/u, "")
      .split(/[?#/]/u)[0]
      ?.trim();
    return normalized || null;
  }
}

function normalizeVkSourceUrl(input: string): string | null {
  const token = extractVkDomainToken(input);
  if (!token) return null;
  return `https://vk.com/${token}`;
}

async function readResponseText(response: Response, encoding = "utf-8"): Promise<string> {
  const buffer = await response.arrayBuffer();
  return new TextDecoder(encoding).decode(buffer);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&quot;/gu, '"')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&hellip;/gu, '...')
    .replace(/&mdash;/gu, '—')
    .replace(/&ndash;/gu, '–')
    .replace(/&laquo;/gu, '«')
    .replace(/&raquo;/gu, '»')
    .replace(/&rsquo;/gu, '’')
    .replace(/&ldquo;/gu, '“')
    .replace(/&rdquo;/gu, '”');
}

function stripHtml(input: string): string {
  const normalized = decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>(?=.)/giu, "\n")
      .replace(/<[^>]+>/gu, " ")
      .replace(/[ \t]{2,}/gu, " ")
  );

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function formatVkPostDate(timestampSeconds: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(timestampSeconds * 1000));
}

function extractVkCommunityIdFromHtml(html: string): string | null {
  const patterns = [/"group_id":(\d+)/u, /"owner_id":-(\d+)/u, /public(\d+)/u, /club(\d+)/u];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function buildVkCommunityWidgetUrl(groupId: string, theme: SmartLinkTheme): string {
  const colors =
    theme === "light"
      ? { color1: "FFFFFF", color2: "3C3C3C", color3: "5181B8" }
      : { color1: "11121C", color2: "F5F7FB", color3: "7B6CFF" };

  const params = new URLSearchParams({
    app: "0",
    width: "100%",
    _ver: "1",
    gid: groupId,
    mode: "4",
    wide: "1",
    height: "560",
    color1: colors.color1,
    color2: colors.color2,
    color3: colors.color3
  });

  return `https://vk.com/widget_community.php?${params.toString()}`;
}

async function resolveVkCommunity(params: {
  source: string;
  theme: SmartLinkTheme;
}): Promise<{ widget: SmartLinkNewsFeedWidget; groupId: string } | null> {
  const sourceUrl = normalizeVkSourceUrl(params.source);
  if (!sourceUrl) return null;

  const directMatch = sourceUrl.match(/vk\.com\/(?:club|public)(\d+)/iu);
  let groupId = directMatch?.[1] ?? null;

  if (!groupId) {
    const domain = extractVkDomainToken(sourceUrl);
    if (!domain) return null;

    try {
      const response = await fetch(`https://vk.com/${domain}`, {
        headers: {
          "user-agent": VK_WIDGET_USER_AGENT,
          "accept-language": "ru,en;q=0.8"
        },
        next: { revalidate: 900 }
      });

      if (!response.ok) return null;
      const html = await readResponseText(response, "windows-1251");
      groupId = extractVkCommunityIdFromHtml(html);
    } catch {
      return null;
    }
  }

  if (!groupId) return null;

  return {
    groupId,
    widget: {
      provider: "vk",
      title: "ВКонтакте",
      sourceUrl,
      embedUrl: buildVkCommunityWidgetUrl(groupId, params.theme)
    }
  };
}

function extractVkPostImageUrl(block: string): string | null {
  const styleMatch = block.match(/background-image:\s*url\(([^)]+)\)/iu);
  if (!styleMatch?.[1]) return null;
  return styleMatch[1].trim().replace(/^['"]|['"]$/gu, "");
}

function parseVkCommunityPosts(html: string): SmartLinkNewsFeedPost[] {
  const matches = Array.from(
    html.matchAll(
      /<div id="wpt-([^"]+)" class="wall_post_cont _wall_post_cont">([\s\S]*?)(?=<div id="wpt-|<div class="wcommunity_footer|<\/body>)/gu
    )
  );

  return matches
    .map((match) => {
      const postKey = match[1]?.trim() ?? "";
      const block = match[2] ?? "";
      const wallPostId = postKey.startsWith("-") || postKey.startsWith("wall") ? postKey : `wall-${postKey}`;
      const href = `https://vk.com/${wallPostId}`;
      const timestamp = Number(block.match(/data-date="(\d{9,})"/u)?.[1] ?? "0");
      const textHtml = block.match(/<div class="wall_post_text"[^>]*>([\s\S]*?)<\/div>/u)?.[1] ?? "";
      const text = stripHtml(textHtml).replace(/Показать ещё/gu, "").trim();
      const imageUrl = extractVkPostImageUrl(block);
      if (!postKey || !timestamp || (!text && !imageUrl)) return null;

      return {
        id: wallPostId,
        url: href,
        publishedAt: new Date(timestamp * 1000).toISOString(),
        publishedLabel: formatVkPostDate(timestamp),
        text,
        imageUrl
      } satisfies SmartLinkNewsFeedPost;
    })
    .filter((item): item is SmartLinkNewsFeedPost => Boolean(item))
    .slice(0, 6);
}

async function resolveVkNewsFeedPosts(params: {
  source: string;
  theme: SmartLinkTheme;
}): Promise<{ widget: SmartLinkNewsFeedWidget; posts: SmartLinkNewsFeedPost[] } | null> {
  const community = await resolveVkCommunity(params);
  if (!community) return null;

  try {
    const response = await fetch(community.widget.embedUrl, {
      headers: {
        "user-agent": VK_WIDGET_USER_AGENT,
        "accept-language": "ru,en;q=0.8"
      },
      next: { revalidate: 900 }
    });

    if (!response.ok) {
      return { widget: community.widget, posts: [] };
    }

    const html = await readResponseText(response, "windows-1251");
    return {
      widget: community.widget,
      posts: parseVkCommunityPosts(html)
    };
  } catch {
    return { widget: community.widget, posts: [] };
  }
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
    labelName: string | null;
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
    upc: params.release.upc?.trim() || null,
    publicSlug: params.promoLink.shortName,
    publicUrl: `${getBaseUrl()}/l/${params.promoLink.shortName}`,
    theme: state.theme,
    allowWaveDownload: state.allowWaveDownload,
    coverUrl: cover.url,
    releaseDate: toIsoDate(params.release.date),
    genre: params.release.genre,
    platforms: ensurePlatformOrder(state.platformLinks, state.platformOrder),
    followLinks: state.followLinks,
    newsFeedLinks: state.newsFeedLinks,
    sectionVisibility: state.sectionVisibility,
    coverVideoUrl: state.coverVideoUrl,
    inlineVideos: state.inlineVideos,
    creditSections: state.creditSections,
    contacts: state.contacts,
    pixels: state.pixels,
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
    sectionVisibility: params.input.sectionVisibility
      ? { ...currentState.sectionVisibility, ...params.input.sectionVisibility }
      : currentState.sectionVisibility,
    coverVideoUrl: params.input.coverVideoUrl?.trim() ?? currentState.coverVideoUrl,
    inlineVideos: params.input.inlineVideos ? normalizeVideoEntries(params.input.inlineVideos, getDefaultInlineVideos()) : currentState.inlineVideos,
    creditSections: params.input.creditSections ? normalizeCreditSections(params.input.creditSections) : currentState.creditSections,
    contacts: params.input.contacts ? normalizeInfoEntries(params.input.contacts, getDefaultContacts()) : currentState.contacts,
    pixels: params.input.pixels ? normalizeInfoEntries(params.input.pixels, getDefaultPixels()) : currentState.pixels,
    newsFeedLinks: {
      ...currentState.newsFeedLinks,
      ...params.input.newsFeedLinks
    },
    followLinks: {
      ...currentState.followLinks,
      ...params.input.followLinks
    },
    platformLinks: { ...currentState.platformLinks },
    platformOrder: currentState.platformOrder.slice()
  };

  const inputPlatformOrder = (params.input.platforms ?? [])
    .map((item) => item.code)
    .filter((code): code is string => SMART_LINK_PLATFORM_CODES.includes(code as SmartLinkPlatformCode));

  for (const item of params.input.platforms ?? []) {
    if (!SMART_LINK_PLATFORM_CODES.includes(item.code as SmartLinkPlatformCode)) continue;
    const current = nextState.platformLinks[item.code] ?? {
      code: item.code,
      label: getSmartLinkPlatformLabel(item.code),
      status: "soon" as SmartLinkPlatformStatus,
      url: null,
      order: nextState.platformOrder.length
    };
    const url = item.url === undefined ? current.url : (item.url?.trim() || null);
    const status = item.status ?? (url ? "live" : current.status);
    nextState.platformLinks[item.code] = {
      ...current,
      url,
      status: !url && status !== "hidden" ? "soon" : url && status === "soon" ? "live" : status,
      order: typeof item.order === "number" ? item.order : current.order
    };
  }

  nextState.platformOrder = normalizePlatformOrder(
    inputPlatformOrder,
    nextState.platformLinks,
    normalizeSelectedPlatforms(release.roles)
  );
  nextState.platformOrder.forEach((code, index) => {
    const item = nextState.platformLinks[code];
    if (item) {
      nextState.platformLinks[code] = {
        ...item,
        order: index
      };
    }
  });

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

  const newsFeedData =
    state.sectionVisibility.newsFeed && state.newsFeedLinks.vk.trim().length > 0
      ? await resolveVkNewsFeedPosts({
          source: state.newsFeedLinks.vk,
          theme: state.theme
        })
      : null;

  return {
    ...ownerView,
    explicit: deriveExplicit({
      tracks: release.track,
      roles: release.roles
    }),
    waveDownloadUrl: buildWaveDownloadUrl({
      allowWaveDownload: state.allowWaveDownload,
      roles: release.roles
    }),
    newsFeedWidget: newsFeedData?.widget ?? null,
    newsFeedPosts: newsFeedData?.posts ?? []
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
