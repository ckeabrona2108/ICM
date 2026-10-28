import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getReleaseCoverAsset } from "@/lib/release-cover";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { retryPrismaSerializationConflict } from "@/lib/prisma-errors";
import {
  getSmartLinkPlatformLabel,
  SMART_LINK_PRIMARY_PLATFORM_CODES,
  SMART_LINK_PLATFORM_CODES
} from "@/lib/smart-link-platforms";
import { normalizeSmartLinkHref, safeSmartLinkHref } from "@/lib/smart-link-urls";
import { findSmartLinkPlatformLinksByUpc, normalizeSmartLinkUpc, SMART_LINK_AUTOFILL_CODES } from "@/lib/smart-link-autofill";
import { isSmartLinkPrerelease } from "@/lib/smart-link-release-date";

type RecordLike = Record<string, unknown>;

export type SmartLinkTheme = "dark" | "light" | "auto";
export type SmartLinkBackground = "cover" | "plain";
export type SmartLinkAccent = "mono" | "red" | "violet" | "green";
export type SmartLinkButtonShape = "round" | "pill" | "square";
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
  // *Views — откуда и с чего открывают страницу, *Clicks — то же только для переходов на площадки.
  sourceViews: Record<string, number>;
  countryViews: Record<string, number>;
  cityViews: Record<string, number>;
  deviceViews: {
    mobile: number;
    desktop: number;
  };
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
  background: SmartLinkBackground;
  accent: SmartLinkAccent;
  buttonShape: SmartLinkButtonShape;
  allowWaveDownload: boolean;
  platformLinks: Record<string, SmartLinkPlatformConfig>;
  platformOrder: string[];
  followLinks: SmartLinkFollowLinks;
  newsFeedLinks: SmartLinkNewsFeedLinks;
  sectionVisibility: SmartLinkSectionVisibility;
  coverVideoUrl: string;
  /** MP4 from Snippet Studio, played muted in place of the cover. Same-origin storage path or empty. */
  snippetVideoUrl: string;
  inlineVideos: SmartLinkVideoEntry[];
  creditSections: SmartLinkCreditSection[];
  contacts: SmartLinkContactEntry[];
  pixels: SmartLinkPixelEntry[];
  presaveUrl: string;
  autofillCheckedAt: string | null;
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
  background: SmartLinkBackground;
  accent: SmartLinkAccent;
  buttonShape: SmartLinkButtonShape;
  allowWaveDownload: boolean;
  coverUrl: string | null;
  releaseDate: string;
  genre: string;
  platforms: SmartLinkPlatformConfig[];
  followLinks: SmartLinkFollowLinks;
  newsFeedLinks: SmartLinkNewsFeedLinks;
  sectionVisibility: SmartLinkSectionVisibility;
  coverVideoUrl: string;
  /** MP4 from Snippet Studio, played muted in place of the cover. Same-origin storage path or empty. */
  snippetVideoUrl: string;
  inlineVideos: SmartLinkVideoEntry[];
  creditSections: SmartLinkCreditSection[];
  contacts: SmartLinkContactEntry[];
  pixels: SmartLinkPixelEntry[];
  /** Pre-save link (e.g. from the distributor) shown with a countdown until the release date. */
  presaveUrl: string;
  /** Last background search of platform links by UPC. */
  autofillCheckedAt: string | null;
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
  background?: SmartLinkBackground;
  accent?: SmartLinkAccent;
  buttonShape?: SmartLinkButtonShape;
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
  snippetVideoUrl?: string | null;
  inlineVideos?: SmartLinkVideoEntry[];
  creditSections?: SmartLinkCreditSection[];
  contacts?: SmartLinkContactEntry[];
  pixels?: SmartLinkPixelEntry[];
  presaveUrl?: string | null;
}

/** Pseudo platform code used for the pre-save button's redirect and click statistics. */
export const SMART_LINK_PRESAVE_CODE = "presave";

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

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.trim());
}

export function getBaseUrl(): string {
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
    sourceViews: {},
    countryViews: {},
    cityViews: {},
    deviceViews: {
      mobile: 0,
      desktop: 0
    },
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
    // Platform buttons are the whole point of a smart link: a fresh link must show them.
    links: true,
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

function normalizeBackground(value: unknown): SmartLinkBackground {
  return value === "plain" ? "plain" : "cover";
}

function normalizeAccent(value: unknown): SmartLinkAccent {
  // White "Слушать" buttons (mono) are the approved default look. The old "brand" value was only ever
  // saved as the previous default, so it also maps to mono; red is now an explicit "red" choice.
  return value === "red" || value === "violet" || value === "green" ? value : "mono";
}

function normalizeButtonShape(value: unknown): SmartLinkButtonShape {
  return value === "pill" || value === "square" ? value : "round";
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

  // Старые счётчики из release.roles копили источники, страны, города и устройства сразу
  // за просмотры и переходы. Разделить их уже нельзя, поэтому считаем их визитами (*Views).
  // Новые события пишутся в smart_link_events, а здесь остаётся только этот исторический итог.
  const isSplitShape = asRecord(source.sourceViews) !== null;
  const visitDeviceSource = isSplitShape ? asRecord(source.deviceViews) : deviceSource;
  const readCounts = (value: unknown) => (asRecord(value) as Record<string, number> | null) ?? {};
  return {
    totalViews: typeof source.totalViews === "number" ? source.totalViews : 0,
    totalClicks: typeof source.totalClicks === "number" ? source.totalClicks : 0,
    platformClicks: readCounts(source.platformClicks),
    sourceViews: readCounts(isSplitShape ? source.sourceViews : source.sourceClicks),
    countryViews: readCounts(isSplitShape ? source.countryViews : source.countryClicks),
    cityViews: readCounts(isSplitShape ? source.cityViews : source.cityClicks),
    deviceViews: {
      mobile: typeof visitDeviceSource?.mobile === "number" ? visitDeviceSource.mobile : 0,
      desktop: typeof visitDeviceSource?.desktop === "number" ? visitDeviceSource.desktop : 0
    },
    sourceClicks: isSplitShape ? readCounts(source.sourceClicks) : {},
    countryClicks: isSplitShape ? readCounts(source.countryClicks) : {},
    cityClicks: isSplitShape ? readCounts(source.cityClicks) : {},
    deviceClicks: {
      mobile: isSplitShape && typeof deviceSource?.mobile === "number" ? deviceSource.mobile : 0,
      desktop: isSplitShape && typeof deviceSource?.desktop === "number" ? deviceSource.desktop : 0
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
    background: normalizeBackground(raw?.background),
    accent: normalizeAccent(raw?.accent),
    buttonShape: normalizeButtonShape(raw?.buttonShape),
    allowWaveDownload: asBoolean(raw?.allowWaveDownload) ?? false,
    platformLinks,
    platformOrder: normalizePlatformOrder(raw?.platformOrder, platformLinks, selectedCodes),
    followLinks: normalizeFollowLinks(raw?.followLinks, userDefaults),
    newsFeedLinks: normalizeNewsFeedLinks(raw?.newsFeedLinks),
    sectionVisibility: hasStoredSectionVisibility(raw)
      ? normalizeSectionVisibility(raw?.sectionVisibility)
      : getDefaultSectionVisibility(),
    coverVideoUrl: asString(raw?.coverVideoUrl) ?? "",
    snippetVideoUrl: normalizeSnippetVideoUrl(raw?.snippetVideoUrl),
    inlineVideos: normalizeVideoEntries(raw?.inlineVideos, getDefaultInlineVideos()),
    creditSections: normalizeCreditSections(raw?.creditSections),
    contacts: normalizeInfoEntries(raw?.contacts, getDefaultContacts()),
    pixels: normalizeInfoEntries(raw?.pixels, getDefaultPixels()),
    presaveUrl: normalizeSmartLinkHref(raw?.presaveUrl),
    autofillCheckedAt: asString(raw?.autofillCheckedAt),
    analytics: normalizeAnalytics(raw?.analytics)
  };
}

const SNIPPET_VIDEO_PATH = /^\/api\/uploads\/object\/uploads\/[0-9a-f-]{36}\/[A-Za-z0-9._%-]+\.mp4$/u;

/** Only MP4s the artist uploaded to our own storage can play in the smart link header. */
export function normalizeSnippetVideoUrl(value: unknown): string {
  const raw = asString(value)?.trim() ?? "";
  return SNIPPET_VIDEO_PATH.test(raw) ? raw : "";
}

function snippetVideoOwnerId(url: string): string | null {
  return url.split("/")[5] ?? null;
}

function writeSmartLinkState(roles: unknown, nextState: SmartLinkState): Prisma.InputJsonValue {
  const root = asRecord(roles) ? structuredClone(roles as Record<string, unknown>) : {};
  (root as Record<string, unknown>).smartLink = nextState as unknown as Prisma.InputJsonValue;
  return root as Prisma.InputJsonValue;
}

export function deriveArtistName(input: {
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
    // vk.ru is the same network as vk.com; artists paste either.
    if (!/(^|\.)vk\.(com|ru)$/iu.test(parsed.hostname)) return null;
    const [segment = ""] = parsed.pathname.split("/").filter(Boolean);
    return segment || null;
  } catch {
    const normalized = trimmed
      .replace(/^https?:\/\/(?:m\.)?vk\.(?:com|ru)\//iu, "")
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

/* ---------- Visitor events (smart_link_events) ---------- */

const SMART_LINK_BOT_USER_AGENT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|vkshare|whatsapp|skypeuripreview|bitlybot|headless|lighthouse|curl|wget|python-requests|httpclient|okhttp|go-http-client|axios|node-fetch/iu;
const SMART_LINK_VIEW_DEDUPE_MS = 30 * 60 * 1000;
const SMART_LINK_CLICK_DEDUPE_MS = 10 * 60 * 1000;
const SMART_LINK_DAILY_WINDOW_DAYS = 90;
const SMART_LINK_GEO_TOP_LIMIT = 50;
const SMART_LINK_RECENT_EVENTS_LIMIT = 25;

export function isSmartLinkBotUserAgent(userAgent: string | null | undefined): boolean {
  const value = userAgent?.trim();
  if (!value) return true;
  return SMART_LINK_BOT_USER_AGENT.test(value);
}

function buildVisitorHash(ip: string | null | undefined, userAgent: string | null | undefined): string {
  return createHash("sha256")
    .update(`${ip?.trim() || "unknown"}|${userAgent?.trim() || ""}`)
    .digest("hex")
    .slice(0, 32);
}

function clampLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 80) : fallback;
}

type SmartLinkEventInput = {
  releaseId: string;
  type: SmartLinkVisitorEvent["type"];
  platformCode?: string;
  utmSource?: string | null;
  referrer?: string | null;
  country?: string | null;
  city?: string | null;
  userAgent?: string | null;
  ip?: string | null;
};

// Вставка без чтения-изменения JSON: просмотры и клики не конфликтуют друг с другом и с настройками.
async function recordSmartLinkEvent(input: SmartLinkEventInput): Promise<void> {
  if (isSmartLinkBotUserAgent(input.userAgent)) return;

  const visitorHash = buildVisitorHash(input.ip, input.userAgent);
  const dedupeMs = input.type === "view" ? SMART_LINK_VIEW_DEDUPE_MS : SMART_LINK_CLICK_DEDUPE_MS;
  const platform = input.type === "click" ? input.platformCode ?? null : null;
  const duplicate = await prisma.smart_link_events.findFirst({
    where: {
      release_id: input.releaseId,
      type: input.type,
      visitor_hash: visitorHash,
      platform,
      created_at: { gte: new Date(Date.now() - dedupeMs) }
    },
    select: { id: true }
  });
  if (duplicate) return;

  await prisma.smart_link_events.create({
    data: {
      release_id: input.releaseId,
      type: input.type,
      platform,
      source: clampLabel(deriveSource({ utmSource: input.utmSource, referrer: input.referrer }), "Direct"),
      device: classifyDevice(input.userAgent ?? null),
      country: clampLabel(input.country, "Unknown"),
      city: clampLabel(input.city, "Unknown"),
      visitor_hash: visitorHash
    }
  });
}

function addCounts(target: Record<string, number>, key: string | null, value: number) {
  const normalized = key ?? "Unknown";
  target[normalized] = (target[normalized] ?? 0) + value;
}

function keepTopCounts(source: Record<string, number>, limit: number): Record<string, number> {
  const entries = Object.entries(source);
  if (entries.length <= limit) return source;
  return Object.fromEntries(entries.sort((left, right) => right[1] - left[1]).slice(0, limit));
}

function cloneAnalytics(state: SmartLinkAnalyticsState): SmartLinkAnalyticsState {
  return structuredClone(state);
}

// Суммирует исторический итог из release.roles с событиями из smart_link_events — одним набором запросов на все релизы.
async function loadSmartLinkAnalytics(
  baselines: Map<string, SmartLinkAnalyticsState>,
  options: { includeRecentEvents?: boolean } = {}
): Promise<Map<string, SmartLinkAnalyticsState>> {
  const releaseIds = Array.from(baselines.keys());
  const result = new Map<string, SmartLinkAnalyticsState>();
  for (const [releaseId, baseline] of baselines) result.set(releaseId, cloneAnalytics(baseline));
  if (releaseIds.length === 0) return result;

  const where = { release_id: { in: releaseIds } };
  const dailySince = new Date(Date.now() - SMART_LINK_DAILY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [totals, platforms, sources, countries, cities, devices, daily, recent] = await Promise.all([
    prisma.smart_link_events.groupBy({ by: ["release_id", "type"], where, _count: { _all: true } }),
    prisma.smart_link_events.groupBy({
      by: ["release_id", "platform"],
      where: { ...where, type: "click" },
      _count: { _all: true }
    }),
    prisma.smart_link_events.groupBy({ by: ["release_id", "type", "source"], where, _count: { _all: true } }),
    prisma.smart_link_events.groupBy({ by: ["release_id", "type", "country"], where, _count: { _all: true } }),
    prisma.smart_link_events.groupBy({ by: ["release_id", "type", "city"], where, _count: { _all: true } }),
    prisma.smart_link_events.groupBy({ by: ["release_id", "type", "device"], where, _count: { _all: true } }),
    prisma.$queryRaw<Array<{ release_id: string; day: string; type: string; count: number }>>(Prisma.sql`
      SELECT "release_id"::text AS "release_id",
             to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "day",
             "type",
             COUNT(*)::int AS "count"
      FROM "smart_link_events"
      WHERE "release_id" IN (${Prisma.join(releaseIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND "created_at" >= ${dailySince}
      GROUP BY 1, 2, 3
    `),
    options.includeRecentEvents
      ? prisma.smart_link_events.findMany({
          where,
          orderBy: { created_at: "desc" },
          take: SMART_LINK_RECENT_EVENTS_LIMIT * Math.min(releaseIds.length, 4)
        })
      : Promise.resolve([])
  ]);

  for (const row of totals) {
    const state = result.get(row.release_id);
    if (!state) continue;
    if (row.type === "click") state.totalClicks += row._count._all;
    else state.totalViews += row._count._all;
  }
  for (const row of platforms) {
    const state = result.get(row.release_id);
    if (state) addCounts(state.platformClicks, row.platform, row._count._all);
  }
  for (const row of sources) {
    const state = result.get(row.release_id);
    if (state) addCounts(row.type === "click" ? state.sourceClicks : state.sourceViews, row.source, row._count._all);
  }
  for (const row of countries) {
    const state = result.get(row.release_id);
    if (state) addCounts(row.type === "click" ? state.countryClicks : state.countryViews, row.country, row._count._all);
  }
  for (const row of cities) {
    const state = result.get(row.release_id);
    if (state) addCounts(row.type === "click" ? state.cityClicks : state.cityViews, row.city, row._count._all);
  }
  for (const row of devices) {
    const state = result.get(row.release_id);
    if (!state) continue;
    const bucket = row.type === "click" ? state.deviceClicks : state.deviceViews;
    bucket[row.device === "mobile" ? "mobile" : "desktop"] += row._count._all;
  }
  for (const row of daily) {
    const state = result.get(row.release_id);
    if (!state) continue;
    const day = state.daily[row.day] ?? { views: 0, clicks: 0 };
    if (row.type === "click") day.clicks += row.count;
    else day.views += row.count;
    state.daily[row.day] = day;
  }

  const recentByRelease = new Map<string, SmartLinkVisitorEvent[]>();
  for (const row of recent) {
    const list = recentByRelease.get(row.release_id) ?? [];
    list.push({
      at: row.created_at.toISOString(),
      type: row.type === "click" ? "click" : "view",
      platform: row.platform ?? undefined,
      source: row.source,
      device: row.device === "mobile" ? "mobile" : "desktop",
      country: row.country,
      city: row.city
    });
    recentByRelease.set(row.release_id, list);
  }

  for (const [releaseId, state] of result) {
    const fresh = recentByRelease.get(releaseId);
    if (fresh) state.recentEvents = [...fresh, ...state.recentEvents].slice(0, SMART_LINK_RECENT_EVENTS_LIMIT);
    state.countryViews = keepTopCounts(state.countryViews, SMART_LINK_GEO_TOP_LIMIT);
    state.cityViews = keepTopCounts(state.cityViews, SMART_LINK_GEO_TOP_LIMIT);
    state.countryClicks = keepTopCounts(state.countryClicks, SMART_LINK_GEO_TOP_LIMIT);
    state.cityClicks = keepTopCounts(state.cityClicks, SMART_LINK_GEO_TOP_LIMIT);
  }

  return result;
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
  // Готовая статистика (для списка она грузится одним набором запросов на все релизы).
  analytics?: SmartLinkAnalyticsState;
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
  const [cover, analytics] = await Promise.all([
    getReleaseCoverAsset({
      id: params.release.id,
      preview: params.release.preview,
      roles: params.release.roles,
      userId: params.release.userId,
      title: params.release.title
    }),
    params.analytics
      ? Promise.resolve(params.analytics)
      : loadSmartLinkAnalytics(new Map([[params.release.id, state.analytics]]), { includeRecentEvents: true }).then(
          (loaded) => loaded.get(params.release.id) ?? state.analytics
        )
  ]);

  return {
    releaseId: params.release.id,
    title: params.release.title,
    artist,
    upc: params.release.upc?.trim() || null,
    publicSlug: params.promoLink.shortName,
    publicUrl: `${getBaseUrl()}/l/${params.promoLink.shortName}`,
    theme: state.theme,
    background: state.background,
    accent: state.accent,
    buttonShape: state.buttonShape,
    allowWaveDownload: state.allowWaveDownload,
    coverUrl: cover.url,
    releaseDate: toIsoDate(params.release.date),
    genre: params.release.genre,
    platforms: ensurePlatformOrder(state.platformLinks, state.platformOrder),
    followLinks: state.followLinks,
    newsFeedLinks: state.newsFeedLinks,
    sectionVisibility: state.sectionVisibility,
    coverVideoUrl: state.coverVideoUrl,
    snippetVideoUrl: state.snippetVideoUrl,
    inlineVideos: state.inlineVideos,
    creditSections: state.creditSections,
    contacts: state.contacts,
    pixels: state.pixels,
    presaveUrl: state.presaveUrl,
    autofillCheckedAt: state.autofillCheckedAt,
    analytics
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

const SLUG_FALLBACK_MISS_TTL_MS = 10 * 60 * 1000;
const SLUG_FALLBACK_MISS_LIMIT = 2000;

const slugFallbackStore = globalThis as typeof globalThis & {
  __icmSmartLinkSlugMisses?: Map<string, number>;
};
const slugFallbackMisses = slugFallbackStore.__icmSmartLinkSlugMisses ?? new Map<string, number>();
slugFallbackStore.__icmSmartLinkSlugMisses = slugFallbackMisses;

function isKnownSlugMiss(slug: string): boolean {
  const expiresAt = slugFallbackMisses.get(slug);
  if (!expiresAt) return false;
  if (expiresAt > Date.now()) return true;
  slugFallbackMisses.delete(slug);
  return false;
}

function rememberSlugMiss(slug: string) {
  if (slugFallbackMisses.size >= SLUG_FALLBACK_MISS_LIMIT) {
    const oldest = slugFallbackMisses.keys().next().value;
    if (oldest !== undefined) slugFallbackMisses.delete(oldest);
  }
  slugFallbackMisses.set(slug, Date.now() + SLUG_FALLBACK_MISS_TTL_MS);
}

async function getPromoLinkBySlugWithFallback(slug: string) {
  const existing = await getPromoLinkBySlug(slug);
  if (existing) return existing;

  // The legacy fallback scans every release, so unknown slugs (bots, typos) must not repeat it.
  if (isKnownSlugMiss(slug)) return null;
  const resolved = await resolvePromoLinkByLegacySlug(slug);
  if (!resolved) rememberSlugMiss(slug);
  return resolved;
}

// Старые адреса строились из «артист-название» или «название-артист» (иногда без дефисов),
// поэтому релиз-кандидат содержит начало первого или последнего фрагмента в названии либо артисте.
function buildLegacySlugReleaseFilter(slug: string): Prisma.releaseWhereInput | null {
  const parts = slug.split("-").filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.at(-1) ?? "";
  const fragments = unique(
    [first.slice(0, 3), parts.length > 1 ? last.slice(0, 3) : last.slice(-3)].filter((value) => value.length >= 2)
  );
  if (fragments.length === 0) return null;
  return {
    OR: fragments.flatMap((fragment) => [
      { title: { contains: fragment, mode: "insensitive" as const } },
      { performer: { contains: fragment, mode: "insensitive" as const } },
      { user: { name: { contains: fragment, mode: "insensitive" as const } } }
    ])
  };
}

async function resolvePromoLinkByLegacySlug(slug: string) {
  const filter = buildLegacySlugReleaseFilter(slug);
  if (!filter) return null;
  const releases = await prisma.release.findMany({
    where: filter,
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

    const promoLinkByRelease = await getPromoLinkByReleaseIdWithRelease(release.id);
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
      const existingForRelease = await getPromoLinkByReleaseIdWithRelease(release.id);
      if (existingForRelease) return existingForRelease;
      continue;
    }

    return getPromoLinkBySlug(slug);
  }

  return null;
}

async function getPromoLinkByReleaseId(releaseId: string) {
  if (!isUuidLike(releaseId)) return null;
  return prisma.promo_links.findFirst({
    where: {
      releaseId
    }
  });
}

async function getPromoLinkByReleaseIdWithRelease(releaseId: string) {
  if (!isUuidLike(releaseId)) return null;
  return prisma.promo_links.findFirst({
    where: {
      releaseId
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

export async function getReleasePublicListenSummary(releaseId: string): Promise<{
  publicSlug: string;
  publicUrl: string;
  coverUrl: string | null;
  artist: string;
  releaseDate: string;
  platforms: Array<{
    code: string;
    label: string;
    href: string;
  }>;
} | null> {
  if (!isUuidLike(releaseId)) return null;
  const promoLink = await getPromoLinkByReleaseId(releaseId);
  if (!promoLink) return null;
  const publicView = await getSmartLinkPublicView(promoLink.shortName);
  if (!publicView) return null;
  return {
    publicSlug: publicView.publicSlug,
    publicUrl: publicView.publicUrl,
    coverUrl: publicView.coverUrl,
    artist: publicView.artist,
    releaseDate: publicView.releaseDate,
    platforms: publicView.platforms
      .filter((platform) => platform.status === "live" && platform.url)
      .map((platform) => ({
        code: platform.code,
        label: platform.label,
        href: `${getBaseUrl()}/l/${publicView.publicSlug}/go/${platform.code}`
      }))
  };
}

async function buildUniquePromoSlug(baseSlug: string): Promise<string> {
  // Одним запросом берём все занятые варианты base, base-2, base-3… и выбираем первый свободный.
  const taken = new Set(
    (
      await prisma.promo_links.findMany({
        where: { shortName: { startsWith: baseSlug } },
        select: { shortName: true }
      })
    ).map((item) => item.shortName)
  );
  if (!taken.has(baseSlug)) return baseSlug;
  let counter = 2;
  while (taken.has(`${baseSlug}-${counter}`)) counter += 1;
  return `${baseSlug}-${counter}`;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2002";
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

async function createPromoLink(releaseId: string, baseSlug: string) {
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const shortName = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    try {
      return await prisma.promo_links.create({
        data: { shortName, releaseId }
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) throw error;
      const existing = await getPromoLinkByReleaseId(releaseId);
      if (existing) return existing;
    }
  }
  throw new Error("SMART_LINK_SLUG_COLLISION");
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
    promoLink = await createPromoLink(release.id, slug);
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

  const approved = releases.filter((release) =>
    shouldTreatReleaseAsApproved({
      status: release.status,
      confirmed: release.confirmed,
      upc: release.upc,
      roles: release.roles
    })
  );
  if (approved.length === 0) return [];

  const existingLinks = await prisma.promo_links.findMany({
    where: { releaseId: { in: approved.map((release) => release.id) } }
  });
  const linkByRelease = new Map<string, (typeof existingLinks)[number]>();
  for (const link of existingLinks) {
    if (!linkByRelease.has(link.releaseId)) linkByRelease.set(link.releaseId, link);
  }

  // Ссылка создаётся один раз — для релизов, одобренных после прошлого открытия списка.
  for (const release of approved) {
    if (linkByRelease.has(release.id)) continue;
    const artist = deriveArtistName({
      performer: release.performer,
      userName: release.user.name,
      roles: release.roles
    });
    const slug = await buildUniquePromoSlug(slugify(`${artist}-${release.title}`));
    linkByRelease.set(release.id, await createPromoLink(release.id, slug));
  }

  const analyticsByRelease = await loadSmartLinkAnalytics(
    new Map(
      approved.map((release) => [
        release.id,
        readSmartLinkState(
          release.roles,
          getDefaultFollowLinks(release.user),
          normalizeSelectedPlatforms(release.roles)
        ).analytics
      ])
    )
  );

  const items: SmartLinkOwnerView[] = await Promise.all(
    approved.map((release) =>
      buildOwnerViewFromRelease({
        promoLink: linkByRelease.get(release.id)!,
        release,
        analytics: analyticsByRelease.get(release.id)
      })
    )
  );

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

  if (params.input.snippetVideoUrl) {
    const snippetVideoUrl = normalizeSnippetVideoUrl(params.input.snippetVideoUrl);
    // A header video must be a file this artist uploaded, never someone else's.
    if (!snippetVideoUrl || snippetVideoOwnerId(snippetVideoUrl) !== params.userId) {
      throw new Error("INVALID_SNIPPET_VIDEO");
    }
  }

  if (typeof params.input.slug === "string" && params.input.slug.trim() !== ownerView.publicSlug) {
    if (!/[a-z0-9а-яё]/iu.test(params.input.slug)) {
      throw new Error("INVALID_SLUG");
    }
    const nextSlug = slugify(params.input.slug);
    if (nextSlug !== ownerView.publicSlug) {
      const existingPromo = await prisma.promo_links.findFirst({
        where: {
          shortName: nextSlug
        }
      });
      if (existingPromo && existingPromo.releaseId !== params.releaseId) {
        throw new Error("SLUG_ALREADY_EXISTS");
      }
      try {
        await prisma.promo_links.updateMany({
          where: {
            releaseId: params.releaseId
          },
          data: {
            shortName: nextSlug
          }
        });
      } catch (error) {
        if (isPrismaUniqueConstraintError(error)) throw new Error("SLUG_ALREADY_EXISTS");
        throw error;
      }
    }
  }

  // Read-modify-write of release.roles races with click tracking and other writers,
  // so it runs in the same serializable transaction pattern as analytics events.
  const saved = await retryPrismaSerializationConflict(() =>
    prisma.$transaction(async (tx) => {
      const release = await tx.release.findFirst({
        where: {
          id: params.releaseId,
          userId: params.userId
        },
        select: {
          roles: true,
          user: { select: { telegram: true, vk: true, personalSiteUrl: true } }
        }
      });
      if (!release) return false;

      const nextState = applySmartLinkOwnerInput(
        readSmartLinkState(
          release.roles,
          getDefaultFollowLinks(release.user),
          normalizeSelectedPlatforms(release.roles)
        ),
        params.input,
        normalizeSelectedPlatforms(release.roles)
      );

      await tx.release.update({
        where: {
          id: params.releaseId
        },
        data: {
          roles: writeSmartLinkState(release.roles, nextState)
        }
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  );
  if (!saved) return null;

  return ensureSmartLinkForRelease({
    userId: params.userId,
    releaseId: params.releaseId
  });
}

function normalizeFollowLinksInput(input: Partial<SmartLinkFollowLinks> | undefined): Partial<SmartLinkFollowLinks> {
  const next: Partial<SmartLinkFollowLinks> = {};
  if (!input) return next;
  for (const key of SMART_LINK_FOLLOW_KEYS) {
    if (typeof input[key] === "string") next[key] = normalizeSmartLinkHref(input[key]);
  }
  return next;
}

function applySmartLinkOwnerInput(
  currentState: SmartLinkState,
  input: SmartLinkOwnerUpdateInput,
  selectedPlatformCodes: string[]
): SmartLinkState {
  const nextState: SmartLinkState = {
    ...currentState,
    theme: input.theme ? normalizeTheme(input.theme) : currentState.theme,
    background: input.background ? normalizeBackground(input.background) : currentState.background,
    accent: input.accent ? normalizeAccent(input.accent) : currentState.accent,
    buttonShape: input.buttonShape ? normalizeButtonShape(input.buttonShape) : currentState.buttonShape,
    allowWaveDownload: input.allowWaveDownload ?? currentState.allowWaveDownload,
    sectionVisibility: input.sectionVisibility
      ? normalizeSectionVisibility({ ...currentState.sectionVisibility, ...input.sectionVisibility })
      : currentState.sectionVisibility,
    coverVideoUrl:
      input.coverVideoUrl === undefined ? currentState.coverVideoUrl : normalizeSmartLinkHref(input.coverVideoUrl),
    snippetVideoUrl:
      input.snippetVideoUrl === undefined ? currentState.snippetVideoUrl : normalizeSnippetVideoUrl(input.snippetVideoUrl),
    inlineVideos: input.inlineVideos
      ? normalizeVideoEntries(input.inlineVideos, getDefaultInlineVideos()).map((row) => ({
          ...row,
          url: normalizeSmartLinkHref(row.url)
        }))
      : currentState.inlineVideos,
    creditSections: input.creditSections
      ? normalizeCreditSections(input.creditSections).map((section) => ({
          ...section,
          rows: section.rows.map((row) => ({ ...row, link: normalizeSmartLinkHref(row.link) }))
        }))
      : currentState.creditSections,
    contacts: input.contacts ? normalizeInfoEntries(input.contacts, getDefaultContacts()) : currentState.contacts,
    pixels: input.pixels ? normalizeInfoEntries(input.pixels, getDefaultPixels()) : currentState.pixels,
    presaveUrl: input.presaveUrl === undefined ? currentState.presaveUrl : normalizeSmartLinkHref(input.presaveUrl),
    newsFeedLinks: {
      ...currentState.newsFeedLinks,
      ...input.newsFeedLinks
    },
    followLinks: {
      ...currentState.followLinks,
      ...normalizeFollowLinksInput(input.followLinks)
    },
    platformLinks: { ...currentState.platformLinks },
    platformOrder: currentState.platformOrder.slice()
  };

  const inputPlatformOrder = (input.platforms ?? [])
    .map((item) => item.code)
    .filter((code): code is string => SMART_LINK_PLATFORM_CODES.includes(code as SmartLinkPlatformCode));

  for (const item of input.platforms ?? []) {
    if (!SMART_LINK_PLATFORM_CODES.includes(item.code as SmartLinkPlatformCode)) continue;
    const current = nextState.platformLinks[item.code] ?? {
      code: item.code,
      label: getSmartLinkPlatformLabel(item.code),
      status: "soon" as SmartLinkPlatformStatus,
      url: null,
      order: nextState.platformOrder.length
    };
    const url = item.url === undefined ? current.url : normalizeSmartLinkHref(item.url) || null;
    const status = item.status ? normalizePlatformStatus(item.status) : url ? "live" : current.status;
    nextState.platformLinks[item.code] = {
      ...current,
      url,
      status: !url && status !== "hidden" ? "soon" : url && status === "soon" ? "live" : status,
      order: typeof item.order === "number" ? item.order : current.order
    };
  }

  nextState.platformOrder = normalizePlatformOrder(inputPlatformOrder, nextState.platformLinks, selectedPlatformCodes);
  nextState.platformOrder.forEach((code, index) => {
    const item = nextState.platformLinks[code];
    if (item) {
      nextState.platformLinks[code] = {
        ...item,
        order: index
      };
    }
  });

  return nextState;
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

  // Посетителю статистика не нужна: не считаем её и не отдаём в публичную страницу.
  const ownerView = await buildOwnerViewFromRelease({
    promoLink: row,
    release,
    analytics: getDefaultAnalytics()
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

export async function trackSmartLinkView(params: {
  slug: string;
  utmSource?: string | null;
  referrer?: string | null;
  country?: string | null;
  city?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}) {
  if (isSmartLinkBotUserAgent(params.userAgent)) return;
  // The tracker always posts the canonical slug, so the legacy full-scan fallback is not needed here.
  const row = await prisma.promo_links.findFirst({
    where: { shortName: params.slug },
    select: { releaseId: true }
  });
  if (!row) return;
  await recordSmartLinkEvent({
    releaseId: row.releaseId,
    type: "view",
    utmSource: params.utmSource,
    referrer: params.referrer,
    country: params.country,
    city: params.city,
    userAgent: params.userAgent,
    ip: params.ip
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
  ip?: string | null;
  trackClick?: boolean;
}): Promise<string | null> {
  // Unknown slugs fall back to the public page route, which still resolves legacy slugs.
  const row = await getPromoLinkBySlug(params.slug);
  if (!row) return null;
  if (!shouldTreatReleaseAsApproved(row.release)) return null;

  const selectedPlatformCodes = normalizeSelectedPlatforms(row.release.roles);
  const state = readSmartLinkState(
    row.release.roles,
    getDefaultFollowLinks(row.release.user),
    selectedPlatformCodes
  );
  const target = state.platformLinks[params.platformCode];
  const destination =
    params.platformCode === SMART_LINK_PRESAVE_CODE
      ? safeSmartLinkHref(state.presaveUrl)
      : target?.status === "live"
        ? safeSmartLinkHref(target.url)
        : null;
  if (!destination) {
    return null;
  }

  // Посетитель не должен ждать записи статистики или получать ошибку из-за неё.
  if (params.trackClick !== false) {
    void recordSmartLinkEvent({
      releaseId: row.releaseId,
      type: "click",
      platformCode: params.platformCode,
      utmSource: params.utmSource,
      referrer: params.referrer,
      country: params.country,
      city: params.city,
      userAgent: params.userAgent,
      ip: params.ip
    }).catch((error) => {
      console.error("[smart-link:click] tracking failed", error);
    });
  }

  return destination;
}

/* ---------- Search of platform links by UPC ---------- */

const AUTOFILL_RETRY_MS = 6 * 60 * 60 * 1000;

function getMissingAutofillCodes(state: SmartLinkState): string[] {
  return SMART_LINK_AUTOFILL_CODES.filter((code) => {
    const item = state.platformLinks[code];
    return !item?.url && item?.status !== "hidden";
  });
}

/** Owner-triggered search: returns found links without saving, the editor merges them into the draft. */
export async function findSmartLinkLinksForOwner(params: {
  userId: string;
  releaseId: string;
}): Promise<{ upc: string | null; found: Record<string, string> } | null> {
  if (!isUuidLike(params.releaseId)) return null;
  const release = await prisma.release.findFirst({
    where: { id: params.releaseId, userId: params.userId },
    select: { upc: true }
  });
  if (!release) return null;
  const upc = normalizeSmartLinkUpc(release.upc);
  return { upc, found: upc ? await findSmartLinkPlatformLinksByUpc(upc) : {} };
}

/**
 * After the release date, fills platforms that still have no link from the UPC search.
 * Called fire-and-forget on page views; retries at most every 6 hours per release and never
 * overwrites a link the artist set or a platform they hid.
 */
const autofillInFlight = new Set<string>();

export async function runSmartLinkAutofillInBackground(slug: string, now: Date = new Date()): Promise<void> {
  // Several visitors can open the page at once; one search per link is enough.
  if (autofillInFlight.has(slug)) return;
  autofillInFlight.add(slug);
  try {
    await autofillSmartLink(slug, now);
  } finally {
    autofillInFlight.delete(slug);
  }
}

async function autofillSmartLink(slug: string, now: Date): Promise<void> {
  const promo = await prisma.promo_links.findFirst({
    where: { shortName: slug },
    select: {
      releaseId: true,
      release: { select: { date: true, upc: true, roles: true, user: { select: { telegram: true, vk: true, personalSiteUrl: true } } } }
    }
  });
  if (!promo) return;
  const upc = normalizeSmartLinkUpc(promo.release.upc);
  if (!upc || isSmartLinkPrerelease(toIsoDate(promo.release.date), now)) return;

  const state = readSmartLinkState(
    promo.release.roles,
    getDefaultFollowLinks(promo.release.user),
    normalizeSelectedPlatforms(promo.release.roles)
  );
  const lastCheck = state.autofillCheckedAt ? Date.parse(state.autofillCheckedAt) : 0;
  if (now.getTime() - lastCheck < AUTOFILL_RETRY_MS) return;
  if (getMissingAutofillCodes(state).length === 0) return;

  const found = await findSmartLinkPlatformLinksByUpc(upc);

  await retryPrismaSerializationConflict(() =>
    prisma.$transaction(async (tx) => {
      const release = await tx.release.findUnique({
        where: { id: promo.releaseId },
        select: { roles: true, user: { select: { telegram: true, vk: true, personalSiteUrl: true } } }
      });
      if (!release) return;
      const selected = normalizeSelectedPlatforms(release.roles);
      const current = readSmartLinkState(release.roles, getDefaultFollowLinks(release.user), selected);
      const missing = new Set(getMissingAutofillCodes(current));
      const platforms = Object.entries(found)
        .filter(([code]) => missing.has(code))
        .map(([code, url]) => ({ code, url, status: "live" as const }));
      const next = applySmartLinkOwnerInput(current, { platforms }, selected);
      next.autofillCheckedAt = now.toISOString();
      await tx.release.update({
        where: { id: promo.releaseId },
        data: { roles: writeSmartLinkState(release.roles, next) }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  );
}
