"use client";

import * as React from "react";
import { Reorder, useDragControls } from "framer-motion";
import Link from "next/link";
import {
  AtSign,
  BellRing,
  BarChart3,
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  GripVertical,
  Link2,
  Moon,
  Palette,
  Plus,
  Rss,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Users,
  Video,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  SmartLinkAccent,
  SmartLinkBackground,
  SmartLinkButtonShape,
  SmartLinkContactEntry,
  SmartLinkCreditSection,
  SmartLinkFollowLinks,
  SmartLinkNewsFeedLinks,
  SmartLinkOwnerView,
  SmartLinkPixelEntry,
  SmartLinkPlatformConfig,
  SmartLinkSectionVisibility,
  SmartLinkTheme,
  SmartLinkVideoEntry
} from "@/lib/smart-link-service";
import { detectSmartLinkPlatform, getSmartLinkPlatformLabel } from "@/lib/smart-link-platforms";
import {
  getSmartLinkAccentColors,
  getSmartLinkShapeRadius,
  SMART_LINK_ACCENT_OPTIONS,
  SMART_LINK_SHAPE_OPTIONS
} from "@/lib/smart-link-appearance";
import { normalizeSmartLinkHref, safeSmartLinkHref } from "@/lib/smart-link-urls";
import { formatSmartLinkReleaseDate, isSmartLinkPrerelease } from "@/lib/smart-link-release-date";
import { SmartLinkPlatformIcon } from "@/components/smart-link/platform-icon";

interface SmartLinkSettingsClientProps {
  releaseId: string;
  initialData: SmartLinkOwnerView;
}

interface SmartLinkDraft {
  slug: string;
  theme: SmartLinkTheme;
  background: SmartLinkBackground;
  accent: SmartLinkAccent;
  buttonShape: SmartLinkButtonShape;
  allowWaveDownload: boolean;
  platforms: SmartLinkPlatformConfig[];
  followLinks: SmartLinkFollowLinks;
  newsFeedLinks: SmartLinkNewsFeedLinks;
  sectionVisibility: SmartLinkSectionVisibility;
  coverVideoUrl: string;
  snippetVideoUrl: string;
  snippetVideoWideUrl: string;
  inlineVideos: SmartLinkVideoEntry[];
  creditSections: SmartLinkCreditSection[];
  contacts: SmartLinkContactEntry[];
  pixels: SmartLinkPixelEntry[];
  presaveUrl: string;
}

type SectionKey = "platforms" | "presave" | "videos" | "credits" | "socials" | "news" | "design" | "pixels" | "analytics";

const NAV_GROUPS: Array<{ title: string; items: Array<{ key: SectionKey; label: string; icon: LucideIcon }> }> = [
  {
    title: "Контент",
    items: [
      { key: "platforms", label: "Площадки", icon: Link2 },
      { key: "presave", label: "Пре-сейв", icon: BellRing },
      { key: "videos", label: "Видео", icon: Video },
      { key: "credits", label: "Авторы", icon: Users },
      { key: "socials", label: "Соцсети и контакты", icon: AtSign },
      { key: "news", label: "Лента новостей", icon: Rss }
    ]
  },
  {
    title: "Страница",
    items: [
      { key: "design", label: "Оформление", icon: Palette },
      { key: "pixels", label: "Пиксели", icon: Target },
      { key: "analytics", label: "Аналитика", icon: BarChart3 }
    ]
  }
];

const THEME_PRESETS: Array<{
  key: string;
  label: string;
  hint: string;
  theme: SmartLinkTheme;
  background: SmartLinkBackground;
  thumbClass: string;
  barClass: string;
}> = [
  { key: "cover", label: "Из обложки", hint: "Размытая обложка на фоне", theme: "dark", background: "cover", thumbClass: "bg-[radial-gradient(circle_at_40%_20%,#7c2d4f,#140c22_70%)]", barClass: "bg-white/20" },
  { key: "dark", label: "Тёмная", hint: "Строго, без цвета", theme: "dark", background: "plain", thumbClass: "bg-[#0b0b0e]", barClass: "bg-white/12" },
  { key: "light", label: "Светлая", hint: "Светлый фон", theme: "light", background: "cover", thumbClass: "bg-[#f4f4f6]", barClass: "bg-black/10" },
  { key: "auto", label: "Авто", hint: "Как в системе слушателя", theme: "auto", background: "cover", thumbClass: "bg-[linear-gradient(90deg,#0b0b0e_50%,#f4f4f6_50%)]", barClass: "bg-zinc-500/40" }
];

const FOLLOW_LINK_META: Array<{ key: keyof SmartLinkFollowLinks; label: string; placeholder: string }> = [
  { key: "telegram", label: "Telegram", placeholder: "t.me/artist" },
  { key: "vk", label: "VK", placeholder: "vk.com/artist" },
  { key: "instagram", label: "Instagram", placeholder: "instagram.com/artist" },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@artist" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@artist" },
  { key: "discord", label: "Discord", placeholder: "discord.gg/artist" },
  { key: "website", label: "Сайт", placeholder: "artist.com" }
];

const INPUT_CLASS =
  "h-10 w-full min-w-0 rounded-[10px] border border-zinc-800 bg-zinc-950 px-3 text-[13.5px] text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15";
const LABEL_CLASS = "mb-1.5 block text-[12.5px] text-zinc-400";
const ADD_BUTTON_CLASS =
  "inline-flex h-9 items-center gap-2 rounded-[10px] border border-dashed border-zinc-700 px-3 text-[13px] text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

function cleanLinkValue(value: unknown): string {
  return typeof value === "string" && !["null", "undefined"].includes(value.trim().toLowerCase()) ? value : "";
}

function draftFromView(view: SmartLinkOwnerView): SmartLinkDraft {
  const followLinks = { ...view.followLinks };
  for (const item of FOLLOW_LINK_META) followLinks[item.key] = cleanLinkValue(followLinks[item.key]);
  return {
    slug: view.publicSlug,
    theme: view.theme,
    background: view.background,
    accent: view.accent,
    buttonShape: view.buttonShape,
    allowWaveDownload: view.allowWaveDownload,
    platforms: view.platforms.slice().sort((left, right) => left.order - right.order),
    followLinks,
    newsFeedLinks: { vk: cleanLinkValue(view.newsFeedLinks.vk) },
    sectionVisibility: view.sectionVisibility,
    coverVideoUrl: view.coverVideoUrl,
    snippetVideoUrl: view.snippetVideoUrl,
    snippetVideoWideUrl: view.snippetVideoWideUrl,
    inlineVideos: view.inlineVideos,
    creditSections: view.creditSections,
    contacts: view.contacts,
    pixels: view.pixels,
    presaveUrl: view.presaveUrl
  };
}

function countChangedFields(draft: SmartLinkDraft, saved: SmartLinkDraft): number {
  return (Object.keys(draft) as Array<keyof SmartLinkDraft>).filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(saved[key])
  ).length;
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function isSectionShown(key: SectionKey, visibility: SmartLinkSectionVisibility): boolean | null {
  switch (key) {
    case "platforms":
      return visibility.links;
    case "videos":
      return visibility.videos;
    case "credits":
      return visibility.credits;
    case "socials":
      return visibility.socials || visibility.contacts;
    case "news":
      return visibility.newsFeed;
    case "pixels":
      return visibility.pixels;
    default:
      return null;
  }
}

export function SmartLinkSettingsClient({ releaseId, initialData }: SmartLinkSettingsClientProps) {
  const [view, setView] = React.useState(initialData);
  const [saved, setSaved] = React.useState(() => draftFromView(initialData));
  const [draft, setDraft] = React.useState(() => draftFromView(initialData));
  const [section, setSection] = React.useState<SectionKey>("platforms");
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const changedCount = React.useMemo(() => countChangedFields(draft, saved), [draft, saved]);

  React.useEffect(() => {
    if (changedCount === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [changedCount]);

  const patch = React.useCallback((next: Partial<SmartLinkDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setNotice(null);
  }, []);

  const setVisibility = React.useCallback((key: keyof SmartLinkSectionVisibility, value: boolean) => {
    setDraft((current) => ({ ...current, sectionVisibility: { ...current.sectionVisibility, [key]: value } }));
    setNotice(null);
  }, []);

  const save = React.useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/smart-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          platforms: draft.platforms.map((item, index) => ({
            code: item.code,
            order: index,
            status: item.status,
            url: item.url
          }))
        })
      });
      const payload = (await response.json().catch(() => null)) as SmartLinkOwnerView | { error?: string } | null;
      if (!response.ok || !payload || !("publicUrl" in payload)) {
        setNotice({ kind: "error", text: (payload && "error" in payload && payload.error) || "Не удалось сохранить." });
        return;
      }
      const next = draftFromView(payload);
      setView(payload);
      setSaved(next);
      setDraft(next);
      setNotice({ kind: "success", text: "Сохранено" });
    } catch {
      setNotice({ kind: "error", text: "Не удалось сохранить." });
    } finally {
      setSaving(false);
    }
  }, [draft, releaseId]);

  const copyUrl = React.useCallback(() => {
    void navigator.clipboard
      .writeText(view.publicUrl)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => null);
  }, [view.publicUrl]);

  const liveCount = draft.platforms.filter((item) => item.status === "live" && item.url).length;
  const addedCount = draft.platforms.filter((item) => item.url).length;
  const prerelease = isSmartLinkPrerelease(view.releaseDate);
  const publicPath = view.publicUrl.replace(/^https?:\/\//, "").replace(/[^/]+$/, "");

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Page header, styled like the Smart Links list */}
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href="/dashboard/smart-links"
            className="inline-flex items-center gap-1 text-[13px] text-zinc-400 transition hover:text-zinc-200"
          >
            <ChevronLeft className="h-4 w-4" />
            Smart Links
          </Link>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="truncate text-[28px] font-semibold tracking-[-0.03em] text-white">{view.title}</h1>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                liveCount > 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${liveCount > 0 ? "bg-emerald-400" : "bg-amber-400"}`} />
              {liveCount > 0 ? "Опубликовано" : "Нет ссылок"}
            </span>
          </div>
          <p className="mt-1.5 truncate text-sm text-zinc-400">
            {view.artist} · UPC {view.upc || "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-0 max-w-full items-center rounded-[10px] border border-zinc-800 bg-zinc-950 pl-3 pr-1 font-mono text-[12.5px]">
            <span className="hidden truncate text-zinc-500 md:inline">{publicPath}</span>
            <span className="truncate">{view.publicSlug}</span>
            <button
              type="button"
              onClick={copyUrl}
              aria-label="Копировать ссылку"
              className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-zinc-900 text-zinc-300 transition hover:text-white"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <a
            href={view.publicUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-zinc-800 px-3 text-sm text-zinc-200 transition hover:bg-zinc-900"
          >
            <ExternalLink className="h-4 w-4" />
            Открыть
          </a>
          <button
            type="button"
            onClick={save}
            disabled={saving || changedCount === 0}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-zinc-50 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
            {changedCount > 0 && !saving ? (
              <span className="rounded-full bg-violet-500 px-1.5 py-px text-[11px] font-semibold text-white">{changedCount}</span>
            ) : null}
          </button>
        </div>
        {notice ? (
          <span
            role="status"
            className={`w-full text-right text-[13px] ${notice.kind === "error" ? "text-rose-300" : "text-emerald-300"}`}
          >
            {notice.text}
          </span>
        ) : null}
      </header>

      <div className="flex flex-col items-start gap-5 lg:flex-row">
        {/* Section nav */}
        <nav
          aria-label="Разделы Smart Link"
          className="flex w-full shrink-0 gap-1 overflow-x-auto rounded-[14px] border border-zinc-800 bg-zinc-950/60 p-2 lg:sticky lg:top-[112px] lg:w-[232px] lg:flex-col lg:overflow-visible lg:p-3"
        >
          <div className="hidden items-center gap-3 px-2 pb-3 pt-1 lg:flex">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-zinc-900">
              {view.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={view.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{view.title}</div>
              <div className="mt-0.5 truncate text-xs text-zinc-400">{view.artist}</div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">UPC {view.upc || "—"}</div>
            </div>
          </div>
          {NAV_GROUPS.map((group) => (
            <React.Fragment key={group.title}>
              <div className="hidden px-2 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500 first-of-type:pt-0 lg:block">
                {group.title}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = section === item.key;
                const shown =
                  item.key === "presave"
                    ? prerelease
                      ? Boolean(draft.presaveUrl.trim())
                      : null
                    : isSectionShown(item.key, draft.sectionVisibility);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSection(item.key)}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[9px] px-2.5 text-left text-sm transition ${
                      active
                        ? "bg-zinc-900 text-white shadow-[inset_0_0_0_1px_rgb(39_39_42)]"
                        : "text-zinc-300 hover:bg-zinc-900/60 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.key === "platforms" ? (
                      <span className="font-mono text-xs text-zinc-400">
                        {addedCount}
                      </span>
                    ) : shown === null ? null : (
                      <span
                        aria-label={shown ? "Показывается на странице" : "Скрыто на странице"}
                        className={`h-1.5 w-1.5 rounded-full ${shown ? "bg-emerald-400" : "bg-zinc-700"}`}
                      />
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        {/* Section content */}
        <main className="w-full min-w-0 flex-1 space-y-5">
          {section === "platforms" ? (
            <PlatformsSection
              draft={draft}
              patch={patch}
              setVisibility={setVisibility}
              platformClicks={view.analytics.platformClicks}
              releaseId={releaseId}
              view={view}
            />
          ) : null}
          {section === "presave" ? <PresaveSection draft={draft} patch={patch} view={view} /> : null}
          {section === "videos" ? <VideosSection draft={draft} patch={patch} setVisibility={setVisibility} /> : null}
          {section === "credits" ? <CreditsSection draft={draft} patch={patch} setVisibility={setVisibility} /> : null}
          {section === "socials" ? <SocialsSection draft={draft} patch={patch} setVisibility={setVisibility} /> : null}
          {section === "news" ? <NewsSection draft={draft} patch={patch} setVisibility={setVisibility} /> : null}
          {section === "design" ? <DesignSection draft={draft} patch={patch} view={view} /> : null}
          {section === "pixels" ? <PixelsSection draft={draft} patch={patch} setVisibility={setVisibility} /> : null}
          {section === "analytics" ? <AnalyticsSection view={view} /> : null}
        </main>

        {/* Live preview */}
        <aside
          aria-label="Предпросмотр"
          className="sticky top-[112px] hidden w-[360px] shrink-0 flex-col items-center gap-4 rounded-[14px] border border-zinc-800 bg-zinc-950/60 p-4 2xl:flex"
        >
          <PhonePreview draft={draft} view={view} />
        </aside>
      </div>
    </div>
  );
}

/* ---------- Shared bits ---------- */

interface SectionProps {
  draft: SmartLinkDraft;
  patch: (next: Partial<SmartLinkDraft>) => void;
  setVisibility: (key: keyof SmartLinkSectionVisibility, value: boolean) => void;
}

function SectionHeader({
  title,
  description,
  children
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition ${checked ? "bg-emerald-500" : "bg-zinc-800"}`}
    >
      <span
        className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
          checked ? "left-[19px]" : "left-[3px] bg-zinc-400"
        }`}
      />
    </button>
  );
}

function VisibilityToggle({ checked, onChange, label = "Показывать на странице" }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex h-9 cursor-pointer items-center gap-2.5 rounded-[10px] border border-zinc-800 bg-zinc-950 pl-3 pr-2 text-[13px] text-zinc-300">
      {label}
      <Switch checked={checked} onChange={onChange} label={label} />
    </label>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[14px] border border-zinc-800 bg-zinc-950/60 ${className}`}>{children}</div>;
}

function EditableRow({
  enabled,
  onToggle,
  onDelete,
  children
}: {
  enabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-3 p-4 transition sm:flex-row sm:items-center ${enabled ? "" : "opacity-55"}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex items-center gap-2">
        <Switch checked={enabled} onChange={onToggle} label="Показывать строку" />
        <button
          type="button"
          onClick={onDelete}
          aria-label="Удалить"
          className="grid h-9 w-9 place-items-center rounded-[9px] border border-zinc-800 text-zinc-400 transition hover:border-zinc-700 hover:text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Platforms ---------- */

/** Sets a platform's link and moves a newly linked platform right after the already linked ones. */
function withPlatformLink(platforms: SmartLinkPlatformConfig[], code: string, url: string): SmartLinkPlatformConfig[] {
  const existing = platforms.find((item) => item.code === code);
  const next: SmartLinkPlatformConfig = existing
    ? { ...existing, url, status: "live" }
    : { code, label: getSmartLinkPlatformLabel(code), url, status: "live", order: 0 };
  const rest = platforms.filter((item) => item.code !== code);
  const ordered = existing?.url
    ? platforms.map((item) => (item.code === code ? next : item))
    : [...rest.filter((item) => item.url), next, ...rest.filter((item) => !item.url)];
  return ordered.map((item, index) => ({ ...item, order: index }));
}

function PlatformsSection({
  draft,
  patch,
  setVisibility,
  platformClicks,
  releaseId,
  view
}: SectionProps & { platformClicks: Record<string, number>; releaseId: string; view: SmartLinkOwnerView }) {
  const [pasted, setPasted] = React.useState("");
  const [message, setMessage] = React.useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [searching, setSearching] = React.useState(false);
  const added = draft.platforms.filter((item) => item.url);
  const prerelease = isSmartLinkPrerelease(view.releaseDate);

  const searchByUpc = async () => {
    setSearching(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/smart-link/autofill`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { found?: Record<string, string>; error?: string } | null;
      if (!response.ok || !payload?.found) {
        setMessage({ kind: "error", text: payload?.error || "Не удалось выполнить поиск. Попробуйте позже." });
        return;
      }
      // Links the artist set or platforms they removed are left alone.
      const fresh = Object.entries(payload.found).filter(([code]) => {
        const existing = draft.platforms.find((item) => item.code === code);
        return !existing?.url && existing?.status !== "hidden";
      });
      if (fresh.length === 0) {
        setMessage({
          kind: Object.keys(payload.found).length > 0 ? "success" : "error",
          text:
            Object.keys(payload.found).length > 0
              ? "Новых ссылок нет — всё найденное уже добавлено."
              : "По UPC пока ничего не нашли. Обычно ссылки появляются в течение 1–3 дней после выхода."
        });
        return;
      }
      let platforms = draft.platforms;
      for (const [code, url] of fresh) platforms = withPlatformLink(platforms, code, url);
      patch({ platforms });
      setMessage({
        kind: "success",
        text: `Нашли ${fresh.length}: ${fresh.map(([code]) => getSmartLinkPlatformLabel(code)).join(", ")}. Проверьте и сохраните.`
      });
    } catch {
      setMessage({ kind: "error", text: "Не удалось выполнить поиск. Попробуйте позже." });
    } finally {
      setSearching(false);
    }
  };

  const updatePlatform = (code: string, next: Partial<SmartLinkPlatformConfig>) => {
    patch({ platforms: draft.platforms.map((item) => (item.code === code ? { ...item, ...next } : item)) });
  };

  const reorder = (codes: string[]) => {
    const byCode = new Map(draft.platforms.map((item) => [item.code, item]));
    const ordered = [
      ...codes.map((code) => byCode.get(code)).filter((item): item is SmartLinkPlatformConfig => Boolean(item)),
      ...draft.platforms.filter((item) => !codes.includes(item.code))
    ];
    patch({ platforms: ordered.map((item, index) => ({ ...item, order: index })) });
  };

  const addFromLink = (event: React.FormEvent) => {
    event.preventDefault();
    const code = detectSmartLinkPlatform(pasted);
    const url = normalizeSmartLinkHref(pasted);
    if (!pasted.trim()) {
      setMessage({ kind: "error", text: "Сначала вставьте ссылку на релиз." });
      return;
    }
    if (!code || !url) {
      setMessage({ kind: "error", text: "Не узнали площадку по этой ссылке — проверьте адрес." });
      return;
    }
    const label = getSmartLinkPlatformLabel(code);
    const hadLink = Boolean(draft.platforms.find((item) => item.code === code)?.url);
    patch({ platforms: withPlatformLink(draft.platforms, code, url) });
    setMessage({ kind: "success", text: hadLink ? `${label}: ссылка обновлена` : `${label} добавлена` });
    setPasted("");
  };

  return (
    <>
      <SectionHeader
        title="Площадки"
        description="Вставьте ссылку на релиз — площадку определим по адресу и добавим кнопку. Порядок меняется перетаскиванием за ручку."
      >
        <div className="flex flex-wrap items-center gap-2">
          {view.upc ? (
            <button
              type="button"
              onClick={() => void searchByUpc()}
              disabled={searching}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-violet-400/30 bg-violet-500/10 px-3 text-[13px] font-medium text-violet-200 transition hover:bg-violet-500/15 disabled:cursor-wait disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {searching ? "Ищем…" : "Найти по UPC"}
            </button>
          ) : null}
          <VisibilityToggle checked={draft.sectionVisibility.links} onChange={(value) => setVisibility("links", value)} />
        </div>
      </SectionHeader>

      {view.upc ? (
        <p className="-mt-1 text-[13px] text-zinc-500">
          {prerelease
            ? `После выхода релиза (${formatSmartLinkReleaseDate(view.releaseDate)}) сами найдём ссылки по UPC и добавим недостающие площадки. VK Музыку и Звук по UPC не найти — их ссылки вставьте вручную.`
            : view.autofillCheckedAt
              ? `Автопоиск по UPC проверял площадки ${new Date(view.autofillCheckedAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} и повторяет проверку раз в 6 часов. VK Музыку и Звук вставьте вручную.`
              : "Автопоиск по UPC проверяет площадки раз в 6 часов и сам добавляет найденные ссылки. VK Музыку и Звук вставьте вручную."}
        </p>
      ) : null}

      {!draft.sectionVisibility.links ? (
        <div className="rounded-[12px] border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
          Блок площадок скрыт — слушатели не увидят ни одной кнопки «Слушать».
        </div>
      ) : null}

      <form
        onSubmit={addFromLink}
        className="flex items-center gap-2 rounded-[14px] border border-zinc-800 bg-zinc-950/60 p-2 focus-within:border-violet-400/50 focus-within:ring-2 focus-within:ring-violet-400/10"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-violet-500/10 text-violet-300">
          <Link2 className="h-4 w-4" />
        </span>
        <label htmlFor="platform-paste" className="sr-only">
          Ссылка на релиз
        </label>
        <input
          id="platform-paste"
          value={pasted}
          onChange={(event) => {
            setPasted(event.target.value);
            setMessage(null);
          }}
          placeholder="https://music.yandex.ru/album/…"
          className="h-10 min-w-0 flex-1 bg-transparent font-mono text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <button
          type="submit"
          className="h-10 shrink-0 rounded-[10px] bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400"
        >
          Добавить
        </button>
      </form>
      <p role="status" className={`-mt-2 text-[13px] ${message ? (message.kind === "error" ? "text-rose-300" : "text-emerald-300") : "text-zinc-500"}`}>
        {message
          ? message.text
          : "Узнаём Яндекс Музыку, VK Музыку, Звук, Spotify, Apple Music, YouTube Music, МТС Музыку, Deezer, SoundCloud и ещё 15 площадок."}
      </p>

      <Panel className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-3 text-[13.5px]">
          <span className="font-medium">Добавлено</span>
          <span className="font-mono text-xs text-zinc-500">{added.length}</span>
          <span className="flex-1" />
          <span className="text-xs text-zinc-500">Показывать</span>
        </div>
        {added.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-zinc-500">Пока ни одной площадки — вставьте первую ссылку выше.</p>
        ) : (
          <Reorder.Group axis="y" values={added.map((item) => item.code)} onReorder={reorder} className="divide-y divide-zinc-800/80">
            {added.map((item, index) => (
              <PlatformRow
                key={item.code}
                item={item}
                index={index}
                clicks={platformClicks[item.code] ?? 0}
                onChange={(next) => updatePlatform(item.code, next)}
                onRemove={() => {
                  // "hidden" without a link also tells the UPC autofill not to bring the platform back.
                  updatePlatform(item.code, { url: null, status: "hidden" });
                  setMessage({ kind: "success", text: `${item.label} убрана` });
                }}
              />
            ))}
          </Reorder.Group>
        )}
      </Panel>

      <Panel className="flex items-center gap-4 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Кнопка «Скачать WAV»</div>
          <div className="mt-0.5 text-[13px] text-zinc-400">Для промо-рассылок и диджеев: отдаёт аудио первого трека.</div>
        </div>
        <Switch
          checked={draft.allowWaveDownload}
          onChange={(value) => patch({ allowWaveDownload: value })}
          label="Кнопка «Скачать WAV»"
        />
      </Panel>
    </>
  );
}

function PlatformRow({
  item,
  index,
  clicks,
  onChange,
  onRemove
}: {
  item: SmartLinkPlatformConfig;
  index: number;
  clicks: number;
  onChange: (next: Partial<SmartLinkPlatformConfig>) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const url = item.url ?? "";
  const valid = Boolean(safeSmartLinkHref(url)) && detectSmartLinkPlatform(url) === item.code;
  const shown = item.status === "live";
  const inputId = `platform-url-${item.code}`;

  return (
    <Reorder.Item value={item.code} dragListener={false} dragControls={controls} className={`bg-zinc-950/60 px-3 py-3 sm:px-4 ${shown ? "" : "opacity-55"}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Перетащить ${item.label}`}
          onPointerDown={(event) => controls.start(event)}
          className="cursor-grab touch-none text-zinc-600 transition hover:text-zinc-300 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="w-5 font-mono text-[11.5px] text-zinc-500">{String(index + 1).padStart(2, "0")}</span>
        <SmartLinkPlatformIcon code={item.code} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.label}</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {clicks > 0 ? `${clicks} ${pluralize(clicks, "переход", "перехода", "переходов")}` : "нет переходов"}
          </div>
        </div>
        <Switch
          checked={shown}
          onChange={(value) => onChange({ status: value ? "live" : "hidden" })}
          label={`Показывать ${item.label}`}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать ${item.label}`}
          className="grid h-8 w-8 place-items-center rounded-[8px] text-zinc-500 transition hover:bg-zinc-900 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2.5 pl-[92px]">
        <label htmlFor={inputId} className="sr-only">
          Ссылка {item.label}
        </label>
        <input
          id={inputId}
          value={url}
          onChange={(event) => onChange({ url: event.target.value })}
          className={`${INPUT_CLASS} h-9 font-mono text-[12.5px] ${valid ? "" : "border-rose-400/50"}`}
        />
        {!valid ? <p className="mt-1 text-xs text-rose-300">Это не ссылка на {item.label} — исправьте или уберите площадку.</p> : null}
      </div>
    </Reorder.Item>
  );
}

/* ---------- Pre-save ---------- */

function PresaveSection({ draft, patch, view }: Omit<SectionProps, "setVisibility"> & { view: SmartLinkOwnerView }) {
  const prerelease = isSmartLinkPrerelease(view.releaseDate);
  const releaseDateLabel = formatSmartLinkReleaseDate(view.releaseDate);
  const valid = !draft.presaveUrl.trim() || Boolean(safeSmartLinkHref(draft.presaveUrl));

  return (
    <>
      <SectionHeader
        title="Пре-сейв"
        description="До выхода релиза страница показывает таймер и кнопку «Пре-сейв». В день релиза она сама переключится на кнопки площадок."
      />

      <Panel className="flex items-start gap-3 px-4 py-3.5">
        <span
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${prerelease ? "bg-violet-400 shadow-[0_0_8px_#a78bfa]" : "bg-zinc-600"}`}
        />
        <div className="text-sm leading-6">
          {prerelease ? (
            <>
              <span className="font-medium">Релиз выйдет {releaseDateLabel}.</span>{" "}
              <span className="text-zinc-400">До этого дня слушатели видят обратный отсчёт и кнопку пре-сейва.</span>
            </>
          ) : (
            <>
              <span className="font-medium">Релиз уже вышел ({releaseDateLabel}).</span>{" "}
              <span className="text-zinc-400">Пре-сейв больше не показывается — на странице кнопки площадок.</span>
            </>
          )}
        </div>
      </Panel>

      <Panel className="p-4">
        <label htmlFor="presave-url" className={LABEL_CLASS}>
          Ссылка на пре-сейв
        </label>
        <input
          id="presave-url"
          value={draft.presaveUrl}
          onChange={(event) => patch({ presaveUrl: event.target.value })}
          placeholder="https://…"
          className={`${INPUT_CLASS} font-mono text-[12.5px] ${valid ? "" : "border-rose-400/50"}`}
        />
        <p className={`mt-1.5 text-xs ${valid ? "text-zinc-500" : "text-rose-300"}`}>
          {valid
            ? "Кнопка ведёт на эту страницу, переходы считаются в аналитике как «Пре-сейв». Без ссылки останется только таймер."
            : "Это не похоже на ссылку — проверьте адрес."}
        </p>
      </Panel>
    </>
  );
}

/* ---------- Videos ---------- */

function VideosSection({ draft, patch, setVisibility }: SectionProps) {
  const updateRow = (id: string, next: Partial<SmartLinkVideoEntry>) =>
    patch({ inlineVideos: draft.inlineVideos.map((row) => (row.id === id ? { ...row, ...next } : row)) });
  const removeRow = (id: string) => {
    const rows = draft.inlineVideos.filter((row) => row.id !== id);
    patch({ inlineVideos: rows.length > 0 ? rows : [{ id: createId(), title: "", url: "", enabled: true }] });
  };

  return (
    <>
      <SectionHeader title="Видео" description="Клип или тизер прямо на странице релиза. YouTube встраивается, остальные ссылки открываются в новой вкладке.">
        <VisibilityToggle checked={draft.sectionVisibility.videos} onChange={(value) => setVisibility("videos", value)} />
      </SectionHeader>
      <Panel className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold">Видео вместо обложки</span>
          <span className="text-[12px] text-zinc-400">
            Собираются в Snippet Studio: 9:16 — на весь экран телефона, 16:9 — для компьютера. Без видео остаётся обычная обложка.
          </span>
        </div>
        {(
          [
            ["snippetVideoUrl", "Телефон · 9:16", "h-24 w-14"],
            ["snippetVideoWideUrl", "Компьютер · 16:9", "h-14 w-24"]
          ] as const
        ).map(([field, label, size]) => (
          <div key={field} className="flex items-center gap-3 rounded-xl border border-zinc-800/80 p-2.5">
            {draft[field] ? (
              <video src={draft[field]} muted loop autoPlay playsInline className={`${size} shrink-0 rounded-lg object-cover`} aria-label={label} />
            ) : (
              <span className={`${size} grid shrink-0 place-items-center rounded-lg bg-zinc-800/70 text-[10px] text-zinc-500`}>обложка</span>
            )}
            <span className="min-w-0 flex-1 text-[13px] font-medium">{label}</span>
            {draft[field] ? (
              <button type="button" onClick={() => patch({ [field]: "" })} className="shrink-0 text-[13px] font-semibold text-rose-300 hover:text-rose-200">
                Убрать
              </button>
            ) : (
              <a href="/dashboard/video-snippets" className="shrink-0 text-[13px] font-medium text-violet-300 hover:text-violet-200">
                Собрать →
              </a>
            )}
          </div>
        ))}
      </Panel>
      <Panel className="p-4">
        <label htmlFor="cover-video" className={LABEL_CLASS}>
          Главное видео (показывается первым)
        </label>
        <input
          id="cover-video"
          value={draft.coverVideoUrl}
          onChange={(event) => patch({ coverVideoUrl: event.target.value })}
          placeholder="youtube.com/watch?v=…"
          className={INPUT_CLASS}
        />
      </Panel>
      <div>
        <h2 className="mb-3 text-[15px] font-semibold">Ещё видео · до 10</h2>
        <Panel className="divide-y divide-zinc-800/80">
          {draft.inlineVideos.map((row) => (
            <EditableRow
              key={row.id}
              enabled={row.enabled}
              onToggle={() => updateRow(row.id, { enabled: !row.enabled })}
              onDelete={() => removeRow(row.id)}
            >
              <div className="grid gap-2 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
                <input
                  aria-label="Название видео"
                  value={row.title}
                  onChange={(event) => updateRow(row.id, { title: event.target.value })}
                  placeholder="Название"
                  className={INPUT_CLASS}
                />
                <input
                  aria-label="Ссылка на видео"
                  value={row.url}
                  onChange={(event) => updateRow(row.id, { url: event.target.value })}
                  placeholder="youtube.com/watch?v=…"
                  className={`${INPUT_CLASS} font-mono text-[12.5px]`}
                />
              </div>
            </EditableRow>
          ))}
        </Panel>
        <button
          type="button"
          disabled={draft.inlineVideos.length >= 10}
          onClick={() => patch({ inlineVideos: [...draft.inlineVideos, { id: createId(), title: "", url: "", enabled: true }] })}
          className={`${ADD_BUTTON_CLASS} mt-3`}
        >
          <Plus className="h-4 w-4" />
          Добавить видео
        </button>
      </div>
    </>
  );
}

/* ---------- Credits ---------- */

function CreditsSection({ draft, patch, setVisibility }: SectionProps) {
  const updateSection = (key: string, rows: SmartLinkCreditSection["rows"]) =>
    patch({ creditSections: draft.creditSections.map((section) => (section.key === key ? { ...section, rows } : section)) });

  return (
    <>
      <SectionHeader title="Авторы" description="Кто работал над релизом: продюсер, звук, обложка, исполнители.">
        <VisibilityToggle checked={draft.sectionVisibility.credits} onChange={(value) => setVisibility("credits", value)} />
      </SectionHeader>
      {draft.creditSections.map((section) => (
        <div key={section.key}>
          <h2 className="text-[15px] font-semibold">{section.title}</h2>
          <p className="mb-3 mt-1 text-[13px] text-zinc-400">{section.description}</p>
          <Panel className="divide-y divide-zinc-800/80">
            {section.rows.map((row) => (
              <EditableRow
                key={row.id}
                enabled={row.enabled}
                onToggle={() =>
                  updateSection(section.key, section.rows.map((item) => (item.id === row.id ? { ...item, enabled: !item.enabled } : item)))
                }
                onDelete={() => {
                  const rows = section.rows.filter((item) => item.id !== row.id);
                  updateSection(section.key, rows.length > 0 ? rows : [{ id: createId(), name: "", role: "", link: "", enabled: true }]);
                }}
              >
                <div className="grid gap-2 md:grid-cols-3">
                  {(["name", "role", "link"] as const).map((field) => (
                    <input
                      key={field}
                      aria-label={field === "name" ? "Имя" : field === "role" ? "Роль" : "Ссылка"}
                      value={row[field]}
                      onChange={(event) =>
                        updateSection(
                          section.key,
                          section.rows.map((item) => (item.id === row.id ? { ...item, [field]: event.target.value } : item))
                        )
                      }
                      placeholder={field === "name" ? "Имя" : field === "role" ? "Роль" : "Ссылка (необязательно)"}
                      className={INPUT_CLASS}
                    />
                  ))}
                </div>
              </EditableRow>
            ))}
          </Panel>
          <button
            type="button"
            onClick={() => updateSection(section.key, [...section.rows, { id: createId(), name: "", role: "", link: "", enabled: true }])}
            className={`${ADD_BUTTON_CLASS} mt-3`}
          >
            <Plus className="h-4 w-4" />
            Добавить
          </button>
        </div>
      ))}
    </>
  );
}

/* ---------- Socials & contacts ---------- */

function SocialsSection({ draft, patch, setVisibility }: SectionProps) {
  const updateContact = (id: string, next: Partial<SmartLinkContactEntry>) =>
    patch({ contacts: draft.contacts.map((row) => (row.id === id ? { ...row, ...next } : row)) });

  return (
    <>
      <SectionHeader title="Соцсети и контакты" description="Куда подписаться и как связаться. Можно вставлять ссылку целиком или просто домен.">
        <VisibilityToggle checked={draft.sectionVisibility.socials} onChange={(value) => setVisibility("socials", value)} label="Соцсети" />
      </SectionHeader>
      <Panel className="grid gap-4 p-4 md:grid-cols-2">
        {FOLLOW_LINK_META.map((item) => (
          <div key={item.key}>
            <label htmlFor={`follow-${item.key}`} className={LABEL_CLASS}>
              {item.label}
            </label>
            <input
              id={`follow-${item.key}`}
              value={draft.followLinks[item.key]}
              onChange={(event) => patch({ followLinks: { ...draft.followLinks, [item.key]: event.target.value } })}
              placeholder={item.placeholder}
              className={INPUT_CLASS}
            />
          </div>
        ))}
      </Panel>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <h2 className="flex-1 text-[15px] font-semibold">Контакты</h2>
        <VisibilityToggle checked={draft.sectionVisibility.contacts} onChange={(value) => setVisibility("contacts", value)} label="Контакты" />
      </div>
      <Panel className="divide-y divide-zinc-800/80">
        {draft.contacts.map((row) => (
          <EditableRow
            key={row.id}
            enabled={row.enabled}
            onToggle={() => updateContact(row.id, { enabled: !row.enabled })}
            onDelete={() => {
              const rows = draft.contacts.filter((item) => item.id !== row.id);
              patch({ contacts: rows.length > 0 ? rows : [{ id: createId(), label: "", value: "", enabled: true }] });
            }}
          >
            <div className="grid gap-2 md:grid-cols-2">
              <input
                aria-label="Заголовок"
                value={row.label}
                onChange={(event) => updateContact(row.id, { label: event.target.value })}
                placeholder="Например, Букинг"
                className={INPUT_CLASS}
              />
              <input
                aria-label="E-mail или ссылка"
                value={row.value}
                onChange={(event) => updateContact(row.id, { value: event.target.value })}
                placeholder="E-mail или ссылка"
                className={INPUT_CLASS}
              />
            </div>
          </EditableRow>
        ))}
      </Panel>
      <button
        type="button"
        onClick={() => patch({ contacts: [...draft.contacts, { id: createId(), label: "", value: "", enabled: true }] })}
        className={ADD_BUTTON_CLASS}
      >
        <Plus className="h-4 w-4" />
        Добавить контакт
      </button>
    </>
  );
}

/* ---------- News feed ---------- */

function NewsSection({ draft, patch, setVisibility }: SectionProps) {
  return (
    <>
      <SectionHeader
        title="Лента новостей"
        description="Последние посты из сообщества ВКонтакте — отдельной вкладкой «Новости» на странице релиза."
      >
        <VisibilityToggle checked={draft.sectionVisibility.newsFeed} onChange={(value) => setVisibility("newsFeed", value)} />
      </SectionHeader>
      <Panel className="p-4">
        <label htmlFor="news-vk" className={LABEL_CLASS}>
          Сообщество ВКонтакте
        </label>
        <input
          id="news-vk"
          value={draft.newsFeedLinks.vk}
          onChange={(event) => patch({ newsFeedLinks: { ...draft.newsFeedLinks, vk: event.target.value } })}
          placeholder="vk.com/artist"
          className={INPUT_CLASS}
        />
      </Panel>
    </>
  );
}

/* ---------- Design ---------- */

function DesignSection({ draft, patch, view }: Omit<SectionProps, "setVisibility"> & { view: SmartLinkOwnerView }) {
  const activePreset =
    THEME_PRESETS.find((preset) => preset.theme === draft.theme && preset.background === draft.background) ??
    THEME_PRESETS.find((preset) => preset.theme === draft.theme) ??
    THEME_PRESETS[0];
  const livePlatforms = draft.platforms.filter((item) => item.status === "live" && item.url).map((item) => item.label);
  const publicPrefix = view.publicUrl.replace(/^https?:\/\//, "").replace(/[^/]+$/, "");

  return (
    <>
      <SectionHeader title="Оформление" description="Как страница выглядит для слушателя. Изменения сразу видны в предпросмотре справа." />

      <section>
        <h2 className="mb-3 text-sm font-semibold">Фон и тема</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {THEME_PRESETS.map((preset) => {
            const active = preset.key === activePreset.key;
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={active}
                onClick={() => patch({ theme: preset.theme, background: preset.background })}
                className={`rounded-[14px] border bg-zinc-950 p-2 text-left transition ${
                  active ? "border-violet-400 ring-[3px] ring-violet-400/20" : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className={`relative h-[84px] overflow-hidden rounded-[9px] ${preset.thumbClass}`}>
                  <div className="absolute left-1/2 top-3 h-8 w-8 -translate-x-1/2 overflow-hidden rounded-md bg-zinc-700">
                    {view.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={view.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className={`absolute inset-x-4 top-[52px] h-2 rounded ${preset.barClass}`} />
                  <div className={`absolute inset-x-4 top-[66px] h-2 rounded ${preset.barClass}`} />
                </div>
                <div className="px-1 pt-2.5 text-[13.5px] font-medium">{preset.label}</div>
                <div className="px-1 pb-1 text-xs text-zinc-400">{preset.hint}</div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold">Цвет кнопок</h2>
          <div className="flex items-center gap-2.5">
            {SMART_LINK_ACCENT_OPTIONS.map((option) => {
              const active = draft.accent === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={active}
                  onClick={() => patch({ accent: option.value })}
                  className={`h-9 w-9 rounded-full border-2 border-[#09090b] transition ${active ? "ring-2 ring-zinc-100" : "ring-2 ring-zinc-800 hover:ring-zinc-600"}`}
                  style={{ backgroundColor: option.swatch }}
                />
              );
            })}
            <span className="ml-1 text-[12.5px] text-zinc-400">
              {SMART_LINK_ACCENT_OPTIONS.find((option) => option.value === draft.accent)?.label}
            </span>
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold">Форма кнопок</h2>
          <div role="group" aria-label="Форма кнопок" className="grid grid-cols-3 rounded-[10px] border border-zinc-800 bg-zinc-900 p-[3px]">
            {SMART_LINK_SHAPE_OPTIONS.map((option) => {
              const active = draft.buttonShape === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => patch({ buttonShape: option.value })}
                  className={`h-8 rounded-[7px] text-[13px] transition ${active ? "bg-zinc-800 font-semibold text-white shadow" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Короткая ссылка</h2>
        <div className="flex h-10 max-w-xl items-center overflow-hidden rounded-[10px] border border-zinc-800 bg-zinc-950 focus-within:border-violet-400/60">
          <span className="hidden shrink-0 pl-3 font-mono text-[13px] text-zinc-500 sm:block">{publicPrefix}</span>
          <label htmlFor="smart-link-slug" className="sr-only">
            Короткая ссылка
          </label>
          <input
            id="smart-link-slug"
            value={draft.slug}
            onChange={(event) => patch({ slug: event.target.value })}
            className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] text-zinc-100 outline-none sm:pl-0.5"
          />
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">Буквы, цифры и дефис. После смены старая короткая ссылка перестанет открываться.</p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Превью при отправке ссылки</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex w-full max-w-[380px] overflow-hidden rounded-[12px] border border-zinc-800 bg-zinc-950">
            <div className="h-24 w-24 shrink-0 bg-zinc-800">
              {view.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={view.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 px-3.5 py-3">
              <div className="truncate text-xs text-zinc-500">{publicPrefix.split("/")[0]}</div>
              <div className="mt-1 truncate text-sm font-semibold">
                {view.artist} — {view.title}
              </div>
              <div className="mt-1 line-clamp-2 text-[12.5px] leading-[1.4] text-zinc-400">
                {livePlatforms.length > 0
                  ? `Слушайте на ${livePlatforms.slice(0, 3).join(", ")}${livePlatforms.length > 3 ? " и других площадках" : ""}`
                  : "Слушайте на стриминговых площадках"}
              </div>
            </div>
          </div>
          <p className="max-w-[280px] text-[13px] leading-5 text-zinc-400">Так ссылка выглядит в Telegram и VK. Обложка и название берутся из релиза.</p>
        </div>
      </section>
    </>
  );
}

/* ---------- Pixels ---------- */

function PixelsSection({ draft, patch, setVisibility }: SectionProps) {
  const updateRow = (id: string, next: Partial<SmartLinkPixelEntry>) =>
    patch({ pixels: draft.pixels.map((row) => (row.id === id ? { ...row, ...next } : row)) });

  return (
    <>
      <SectionHeader
        title="Пиксели"
        description={
          <>
            Счётчики рекламных кабинетов для ретаргетинга. Meta Pixel — числовой ID, VK Реклама — ID счётчика Top.Mail.Ru
            (числом) или код вида VK-RTRG-123456-AbCdE.
          </>
        }
      >
        <VisibilityToggle checked={draft.sectionVisibility.pixels} onChange={(value) => setVisibility("pixels", value)} label="Включить пиксели" />
      </SectionHeader>
      <Panel className="divide-y divide-zinc-800/80">
        {draft.pixels.map((row) => (
          <EditableRow
            key={row.id}
            enabled={row.enabled}
            onToggle={() => updateRow(row.id, { enabled: !row.enabled })}
            onDelete={() => {
              const rows = draft.pixels.filter((item) => item.id !== row.id);
              patch({ pixels: rows.length > 0 ? rows : [{ id: createId(), label: "VK Pixel", value: "", enabled: true }] });
            }}
          >
            <div className="grid gap-2 md:grid-cols-2">
              <input
                aria-label="Название пикселя"
                value={row.label}
                onChange={(event) => updateRow(row.id, { label: event.target.value })}
                placeholder="VK Pixel или Meta Pixel"
                className={INPUT_CLASS}
              />
              <input
                aria-label="ID пикселя"
                value={row.value}
                onChange={(event) => updateRow(row.id, { value: event.target.value })}
                placeholder="ID пикселя"
                className={`${INPUT_CLASS} font-mono text-[12.5px]`}
              />
            </div>
          </EditableRow>
        ))}
      </Panel>
      <button
        type="button"
        onClick={() => patch({ pixels: [...draft.pixels, { id: createId(), label: "", value: "", enabled: true }] })}
        className={ADD_BUTTON_CLASS}
      >
        <Plus className="h-4 w-4" />
        Добавить пиксель
      </button>
    </>
  );
}

/* ---------- Analytics ---------- */

function AnalyticsSection({ view }: { view: SmartLinkOwnerView }) {
  const { analytics } = view;
  const ctr = analytics.totalViews > 0 ? Math.round((analytics.totalClicks / analytics.totalViews) * 100) : 0;
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    return { key, ...(analytics.daily[key] ?? { views: 0, clicks: 0 }) };
  });
  const maxDay = Math.max(1, ...days.map((day) => day.views));
  const topPlatforms = Object.entries(analytics.platformClicks)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  const maxPlatform = Math.max(1, ...topPlatforms.map(([, value]) => value));
  const topSources = Object.entries(analytics.sourceViews)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);

  return (
    <>
      <SectionHeader title="Аналитика" description="Просмотры страницы и переходы на площадки за всё время." />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Просмотры", value: analytics.totalViews.toLocaleString("ru-RU") },
          { label: "Переходы", value: analytics.totalClicks.toLocaleString("ru-RU") },
          { label: "Конверсия в переход", value: `${ctr}%` }
        ].map((tile) => (
          <Panel key={tile.label} className="px-4 py-3.5">
            <div className="text-[12.5px] text-zinc-400">{tile.label}</div>
            <div className="mt-1.5 text-2xl font-semibold tracking-[-0.03em]">{tile.value}</div>
          </Panel>
        ))}
      </div>
      <Panel className="p-4">
        <div className="mb-3 text-sm font-semibold">Просмотры за 14 дней</div>
        <div className="flex h-28 items-end gap-1.5">
          {days.map((day) => (
            <div
              key={day.key}
              title={`${day.key}: ${day.views} просмотров, ${day.clicks} переходов`}
              className="flex-1 rounded-t bg-violet-400/70"
              style={{ height: `${Math.max(3, (day.views / maxDay) * 100)}%` }}
            />
          ))}
        </div>
      </Panel>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-3 text-sm font-semibold">Площадки</div>
          {topPlatforms.length === 0 ? <p className="text-[13px] text-zinc-500">Переходов пока нет.</p> : null}
          <div className="space-y-2.5">
            {topPlatforms.map(([code, value]) => (
              <div key={code} className="flex items-center gap-3">
                <SmartLinkPlatformIcon code={code} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-[13px]">
                    <span className="truncate">{getSmartLinkPlatformLabel(code)}</span>
                    <span className="tabular-nums text-zinc-400">{value}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-zinc-300" style={{ width: `${(value / maxPlatform) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mb-3 text-sm font-semibold">Источники</div>
          {topSources.length === 0 ? <p className="text-[13px] text-zinc-500">Данных пока нет.</p> : null}
          <div className="space-y-2">
            {topSources.map(([source, value]) => (
              <div key={source} className="flex justify-between text-[13px]">
                <span className="truncate">{source}</span>
                <span className="tabular-nums text-zinc-400">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-zinc-800 pt-3 text-[13px] text-zinc-400">
            Визиты: телефон {analytics.deviceViews.mobile} · компьютер {analytics.deviceViews.desktop}
          </div>
        </Panel>
      </div>
    </>
  );
}

/* ---------- Phone preview ---------- */

function PhonePreview({ draft, view }: { draft: SmartLinkDraft; view: SmartLinkOwnerView }) {
  const [autoMode, setAutoMode] = React.useState<"dark" | "light">("dark");
  const isLight = draft.theme === "light" || (draft.theme === "auto" && autoMode === "light");
  const prerelease = isSmartLinkPrerelease(view.releaseDate);
  const accent = getSmartLinkAccentColors(draft.accent, isLight);
  const radius = getSmartLinkShapeRadius(draft.buttonShape);
  const showCover = draft.background === "cover" && Boolean(view.coverUrl);
  const rows = draft.sectionVisibility.links
    ? draft.platforms.filter((item) => item.status === "live" && safeSmartLinkHref(item.url))
    : [];

  return (
    <>
      <div className="flex w-full items-center gap-2">
        <span className="flex-1 text-[13px] text-zinc-400">Предпросмотр · до сохранения</span>
        {draft.theme === "auto" ? (
          <div role="group" aria-label="Тема устройства" className="flex rounded-[9px] border border-zinc-800 bg-zinc-900 p-[3px]">
            {(["dark", "light"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-label={mode === "dark" ? "Тёмная тема устройства" : "Светлая тема устройства"}
                aria-pressed={autoMode === mode}
                onClick={() => setAutoMode(mode)}
                className={`grid h-[26px] w-[30px] place-items-center rounded-[6px] ${autoMode === mode ? "bg-zinc-800 text-white" : "text-zinc-400"}`}
              >
                {mode === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="h-[640px] w-[310px] shrink-0 rounded-[44px] bg-[#1c1c20] p-[9px] shadow-[0_0_0_1px_#2a2a30,0_40px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className={`relative h-full w-full overflow-hidden rounded-[36px] ${isLight ? "bg-[#f6f5fb]" : "bg-[#0b0b10]"}`}>
          {showCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.coverUrl ?? undefined}
              alt=""
              aria-hidden="true"
              className={`absolute left-1/2 top-1/3 h-[150%] w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover blur-[50px] ${isLight ? "opacity-30" : "opacity-55"}`}
            />
          ) : null}
          <div className="relative flex h-full flex-col items-center overflow-y-auto px-[18px] pb-[18px] pt-[26px]">
            <div className="h-[150px] w-[150px] shrink-0 overflow-hidden rounded-[14px] bg-zinc-800 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.6)]">
              {view.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={view.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className={`mt-3.5 text-center text-xl font-bold tracking-[-0.02em] ${isLight ? "text-[#111114]" : "text-white"}`}>{view.title}</div>
            <div className={`mt-0.5 text-[13px] ${isLight ? "text-[#55555f]" : "text-zinc-300"}`}>{view.artist}</div>
            {prerelease ? (
              <div className="mt-4 w-full space-y-2">
                <div className={`text-center text-xs ${isLight ? "text-[#55555f]" : "text-zinc-300"}`}>
                  Релиз выйдет {formatSmartLinkReleaseDate(view.releaseDate)}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {["дн", "ч", "мин", "сек"].map((label) => (
                    <div
                      key={label}
                      className={`rounded-[10px] border py-1.5 text-center ${isLight ? "border-black/[0.08] bg-white" : "border-white/10 bg-white/[0.07]"}`}
                    >
                      <div className={`text-base font-semibold tabular-nums ${isLight ? "text-[#111114]" : "text-white"}`}>00</div>
                      <div className={`text-[10px] ${isLight ? "text-[#55555f]" : "text-zinc-400"}`}>{label}</div>
                    </div>
                  ))}
                </div>
                {safeSmartLinkHref(draft.presaveUrl) ? (
                  <div
                    className="flex h-11 items-center justify-center text-[13.5px] font-semibold"
                    style={{ background: accent.background, color: accent.color, borderRadius: radius.button }}
                  >
                    Пре-сейв
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 flex w-full flex-col gap-[7px]">
              {rows.map((item) => (
                <div
                  key={item.code}
                  className={`flex h-[46px] items-center gap-2.5 border pl-2.5 pr-1.5 ${
                    isLight ? "border-black/[0.08] bg-white" : "border-white/10 bg-white/[0.07]"
                  }`}
                  style={{ borderRadius: radius.card }}
                >
                  <SmartLinkPlatformIcon code={item.code} size={26} />
                  <span className={`flex-1 truncate text-[13.5px] font-medium ${isLight ? "text-[#111114]" : "text-white"}`}>{item.label}</span>
                  <span
                      className="flex h-8 items-center px-3.5 text-[12.5px] font-semibold"
                      style={{ background: accent.background, color: accent.color, borderRadius: radius.button }}
                    >
                      Слушать
                    </span>
                </div>
              ))}
              {rows.length === 0 && !prerelease ? (
                <div className={`rounded-xl border border-dashed px-3 py-4 text-center text-xs ${isLight ? "border-black/15 text-[#55555f]" : "border-white/20 text-zinc-400"}`}>
                  Кнопок площадок нет
                </div>
              ) : null}
            </div>
            <div className="flex-1" />
            <div className={`pt-4 text-[10.5px] uppercase tracking-[0.18em] ${isLight ? "text-[#55555f]" : "text-zinc-400"}`}>by ICECREAMMUSIC</div>
          </div>
        </div>
      </div>
    </>
  );
}
