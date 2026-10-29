import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache, type CSSProperties } from "react";
import { ExternalLink, Mail, Music2, Send, Video } from "lucide-react";

import { SmartLinkPlatformIcon } from "@/components/smart-link/platform-icon";
import { SmartLinkCoverVideo } from "@/components/smart-link/smart-link-cover-video";
import { SmartLinkLiveBackground } from "@/components/smart-link/smart-link-live-background";
import { SmartLinkTiltCover } from "@/components/smart-link/smart-link-tilt-cover";
import { SmartLinkCountdown } from "@/components/smart-link/smart-link-countdown";
import { SmartLinkPixels } from "@/components/smart-link/smart-link-pixels";
import { SmartLinkPublicModeSwitcher } from "@/components/smart-link/smart-link-public-mode-switcher";
import { SmartLinkShareButton } from "@/components/smart-link/smart-link-share-button";
import { SmartLinkViewTracker } from "@/components/smart-link/smart-link-view-tracker";
import { getSmartLinkAccentColors, getSmartLinkShapeRadius } from "@/lib/smart-link-appearance";
import { getSmartLinkPublicView, type SmartLinkPageStyle } from "@/lib/smart-link-service";
import { decodeSmartLinkSlug, parseSmartLinkPixelIds, safeSmartLinkHref } from "@/lib/smart-link-urls";
import {
  formatSmartLinkReleaseDate,
  getSmartLinkReleaseMoment,
  isSmartLinkPrerelease
} from "@/lib/smart-link-release-date";

export const dynamic = "force-dynamic";

// generateMetadata and the page both need the view; share one lookup per request.
const getPublicView = cache(getSmartLinkPublicView);

function buildEmbedUrl(url: string): string | null {
  if (!safeSmartLinkHref(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace(/^\/+/, "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizePublicItems<T extends { enabled: boolean }>(items: T[]) {
  return items.filter((item) => item.enabled);
}

function isExternalHref(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isEmailValue(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());
}

function absoluteUrl(pathOrUrl: string | null | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

export async function generateMetadata({
  params
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getPublicView(decodeSmartLinkSlug(params.slug));
  if (!data) {
    return {
      title: "Релиз не найден"
    };
  }

  const pageUrl = absoluteUrl(`/l/${data.publicSlug}`);
  const image = absoluteUrl(data.coverUrl);
  const title = `${data.artist} — ${data.title}`;
  const description = `Слушайте ${data.title} на стриминговых площадках ICECREAMMUSIC Smart Link.`;

  return {
    title,
    description,
    alternates: pageUrl ? { canonical: pageUrl } : undefined,
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: "music.song",
      images: image ? [{ url: image }] : undefined
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined
    }
  };
}

export default async function SmartLinkPublicPage({
  params,
  searchParams
}: {
  params: { slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const data = await getPublicView(decodeSmartLinkSlug(params.slug));
  if (!data) {
    notFound();
  }

  const passthroughParams = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(searchParams ?? {})) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value && key.startsWith("utm_")) passthroughParams.set(key, value);
  }
  const queryString = passthroughParams.toString();
  const platformButtons = data.platforms.filter((item) => item.status === "live" && Boolean(safeSmartLinkHref(item.url)));
  const shareLinks = [
    {
      label: "Telegram",
      shortLabel: "TG",
      href: `https://t.me/share/url?url=${encodeURIComponent(data.publicUrl)}&text=${encodeURIComponent(`${data.artist} — ${data.title}`)}`
    },
    {
      label: "WhatsApp",
      shortLabel: "WA",
      href: `https://wa.me/?text=${encodeURIComponent(`${data.artist} — ${data.title} ${data.publicUrl}`)}`
    },
    {
      label: "VK",
      shortLabel: "VK",
      href: `https://vk.com/share.php?url=${encodeURIComponent(data.publicUrl)}`
    },
    {
      label: "Facebook",
      shortLabel: "f",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.publicUrl)}`
    }
  ];
  const followEntries = Object.entries(data.followLinks)
    .map(([key, value]) => [key, safeSmartLinkHref(value)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  const newsFeedWidget = data.newsFeedWidget;
  const hasNewsFeed =
    data.sectionVisibility.newsFeed &&
    (data.newsFeedPosts.length > 0 || Boolean(newsFeedWidget) || data.newsFeedLinks.vk.trim().length > 0);
  const coverVideoEmbedUrl = buildEmbedUrl(data.coverVideoUrl);
  const inlineVideos = normalizePublicItems(data.inlineVideos).filter((item) => Boolean(safeSmartLinkHref(item.url)));
  const creditSections = data.creditSections
    .map((section) => ({
      ...section,
      rows: normalizePublicItems(section.rows).filter(
        (row) => row.name.trim().length > 0 || row.role.trim().length > 0 || row.link.trim().length > 0
      )
    }))
    .filter((section) => section.rows.length > 0);
  const contacts = normalizePublicItems(data.contacts).filter(
    (item) => item.label.trim().length > 0 || item.value.trim().length > 0
  );
  const contactEntriesWithValue = contacts.filter((item) => item.value.trim().length > 0);
  const pixelIds = data.sectionVisibility.pixels ? parseSmartLinkPixelIds(data.pixels) : null;
  // "auto" follows the visitor's system theme via the Sec-CH-Prefers-Color-Scheme client hint
  // (requested in next.config.mjs); browsers without client hints get the dark theme.
  const prefersLight = headers().get("sec-ch-prefers-color-scheme")?.trim().replace(/"/g, "") === "light";
  const isLightTheme = data.theme === "light" || (data.theme === "auto" && prefersLight);
  const accentColors = getSmartLinkAccentColors(data.accent, isLightTheme);
  const shapeRadius = getSmartLinkShapeRadius(data.buttonShape);
  const showCoverBackground = data.background === "cover" && Boolean(data.coverUrl);
  const sectionSurface = isLightTheme
    ? "border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(247,249,253,0.94))] shadow-[0_18px_48px_-36px_rgba(72,86,122,0.22)]"
    : "border-white/10 bg-white/[0.03]";
  const denseSurface = isLightTheme
    ? "border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,248,252,0.96))]"
    : "border-white/10 bg-black/20";
  const rowSurface = isLightTheme
    ? "border-black/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(249,250,253,0.92))]"
    : "border-white/8 bg-white/[0.03]";
  const mutedText = isLightTheme ? "text-black/50" : "text-white/50";
  const sectionText = isLightTheme ? "text-black/82" : "text-white/82";
  const softText = isLightTheme ? "text-black/60" : "text-white/60";
  const shellSurface = isLightTheme ? "text-[#121620]" : "text-white";
  const cardSurface = isLightTheme
    ? "border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(249,250,253,0.96))] text-[#161b24] shadow-[0_16px_38px_-30px_rgba(72,86,122,0.26)] hover:border-black/14 hover:bg-white"
    : "border-white/12 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.07]";
  // Page styles share their look with the studio templates; they apply to the dark theme.
  const pageStyle = isLightTheme ? "auto" : data.pageStyle;
  const autoVariants = ["lava", "aurora", "nebula", "mesh"] as const;
  const slugHash = [...data.publicSlug].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  const liveBackgroundVariant =
    pageStyle === "neon" ? "aurora" : pageStyle === "film" ? "haze" : pageStyle === "gloss" ? "mesh" : pageStyle === "minimal" ? null : autoVariants[slugHash % autoVariants.length];
  const darkPlatformSurface: Record<SmartLinkPageStyle, string> = {
    auto: "border-white/10 bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md hover:border-white/20 hover:bg-white/[0.12]",
    neon: "border-[#8b72ff]/45 bg-[#0d0a24]/55 text-white shadow-[0_0_26px_-8px_rgba(123,97,255,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md hover:border-[#22d3ee]/60 hover:shadow-[0_0_30px_-6px_rgba(34,211,238,0.8)]",
    film: "border-[#f1e7cf]/15 bg-[#2a2016]/45 text-[#f6efe0] backdrop-blur-sm hover:border-[#f1e7cf]/30 hover:bg-[#2a2016]/60",
    gloss: "border-white/25 bg-white/[0.13] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_18px_40px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl hover:bg-white/[0.2]",
    minimal: "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.07]"
  };
  const platformCardSurface = isLightTheme
    ? "border-black/[0.06] bg-white/90 text-[#111114] shadow-[0_12px_28px_-24px_rgba(72,86,122,0.25)] hover:bg-white"
    : darkPlatformSurface[pageStyle];
  const hasPhoneSnippet = Boolean(data.snippetVideoUrl);
  const hasWideSnippet = Boolean(data.snippetVideoWideUrl);
  const coverPhoto = (
    <SmartLinkTiltCover className="sl-enter-cover mx-auto aspect-square w-full max-w-[240px]">
      <div className="h-full w-full overflow-hidden rounded-[18px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
        {data.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.coverUrl} alt={data.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/[0.06] text-white/40">
            <Music2 className="h-12 w-12" />
          </div>
        )}
      </div>
    </SmartLinkTiltCover>
  );
  // Wide screens play the 16:9 studio clip when there is one; otherwise, and on phones
  // without a vertical clip, the plain cover stays.
  const coverPanel = (
    <>
      {data.snippetVideoWideUrl ? (
        <div className="sl-enter-cover hidden aspect-video w-full overflow-hidden rounded-[22px] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/10 lg:block">
          <SmartLinkCoverVideo src={data.snippetVideoWideUrl} poster={data.coverUrl} title={data.title} media="(min-width: 1024px)" />
        </div>
      ) : null}
      {hasWideSnippet ? <div className="lg:hidden">{coverPhoto}</div> : coverPhoto}
    </>
  );

  const headerPanel = (
    <div className="sl-enter-rise text-center" style={{ "--sl-i": 0 } as CSSProperties}>
      <h1 className={`text-[26px] font-bold leading-tight tracking-[-0.03em] sm:text-[28px] ${isLightTheme ? "text-[#111114]" : "text-white"}`}>
        {data.title}
      </h1>
      <div className={`mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-[14px] ${softText}`}>
        <span>{data.artist}</span>
        <span aria-hidden="true">·</span>
        <span>{data.releaseDate.slice(0, 4)}</span>
        {data.explicit ? (
          <span
            title="Explicit"
            className={`ml-0.5 inline-grid h-[18px] w-[18px] place-items-center rounded-[4px] text-[10px] font-bold ${
              isLightTheme ? "bg-black/10 text-black/60" : "bg-white/15 text-white/75"
            }`}
          >
            E
          </span>
        ) : null}
      </div>
    </div>
  );

  const prerelease = isSmartLinkPrerelease(data.releaseDate);
  const presaveHref = safeSmartLinkHref(data.presaveUrl)
    ? `/l/${encodeURIComponent(data.publicSlug)}/go/presave${queryString ? `?${queryString}` : ""}`
    : null;
  const presavePanel = prerelease ? (
    <div className="sl-enter-rise space-y-3" style={{ "--sl-i": 1 } as CSSProperties}>
      <div className={`text-center text-[13px] ${softText}`}>Релиз выйдет {formatSmartLinkReleaseDate(data.releaseDate)}</div>
      <SmartLinkCountdown target={getSmartLinkReleaseMoment(data.releaseDate).toISOString()} theme={isLightTheme ? "light" : "dark"} />
      {presaveHref ? (
        <a
          href={presaveHref}
          target="_blank"
          rel="noreferrer"
          className="flex h-14 w-full items-center justify-center text-[16px] font-semibold shadow-[0_18px_36px_-24px_rgba(0,0,0,0.5)] transition hover:brightness-110"
          style={{ background: accentColors.background, color: accentColors.color, borderRadius: shapeRadius.button }}
        >
          Пре-сейв
        </a>
      ) : null}
    </div>
  ) : null;

  const releaseLinksPanel = data.sectionVisibility.links ? (
    <div className="grid gap-2">
      {platformButtons.map((item, index) => {
        const href = `/l/${encodeURIComponent(data.publicSlug)}/go/${encodeURIComponent(item.code)}${queryString ? `?${queryString}` : ""}`;
        return (
          <a
            key={item.code}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={`sl-enter-rise group flex h-[60px] items-center justify-between gap-3 overflow-hidden border pl-3 pr-2 transition ${platformCardSurface}`}
            style={{ borderRadius: shapeRadius.card, "--sl-i": index + 2 } as CSSProperties}
          >
            <span className="flex min-w-0 items-center gap-3">
              <SmartLinkPlatformIcon code={item.code} size={34} />
              <span className="block min-w-0 truncate text-[15px] font-medium">{item.label}</span>
            </span>
            <span
              className="inline-flex h-10 shrink-0 items-center justify-center px-5 text-[14px] font-semibold transition group-hover:brightness-110"
              style={{ background: accentColors.background, color: accentColors.color, borderRadius: shapeRadius.button }}
            >
              Слушать
            </span>
          </a>
        );
      })}

      {data.waveDownloadUrl ? (
        <a
          href={data.waveDownloadUrl}
          target="_blank"
          rel="noreferrer"
          className={`group flex items-center justify-between rounded-[16px] border px-3 py-2.5 transition ${cardSurface}`}
        >
          <span className="font-medium">Скачать WAV</span>
          <ExternalLink
            className={`h-4 w-4 transition ${isLightTheme ? "text-black/42 group-hover:text-black/62" : "text-white/55 group-hover:text-white/80"}`}
          />
        </a>
      ) : null}
    </div>
  ) : null;

  const newsPanel = (
    <section className={`rounded-[18px] border p-3 ${sectionSurface}`}>
      <div className={`mb-3 flex items-center gap-2 text-sm font-semibold ${sectionText}`}>
        <Send className="h-4 w-4" />
        Последние посты
      </div>
      <div className="space-y-3">
        {data.newsFeedPosts.length > 0 ? (
          data.newsFeedPosts.map((post) => (
            <article key={post.id} className={`overflow-hidden rounded-[16px] border p-3 ${denseSurface}`}>
              {post.imageUrl ? (
                <div className="mb-3 overflow-hidden rounded-[14px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.imageUrl} alt="" className="h-auto w-full object-cover" />
                </div>
              ) : null}
              <div className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${mutedText}`}>{post.publishedLabel}</div>
              {post.text ? <p className={`mt-2 line-clamp-6 whitespace-pre-line text-[14px] leading-6 ${sectionText}`}>{post.text}</p> : null}
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold transition ${isLightTheme ? "text-[#6558ff] hover:text-[#5445ff]" : "text-[#9b90ff] hover:text-[#c1bbff]"}`}
              >
                Открыть пост
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </article>
          ))
        ) : (
          <div className={`rounded-[16px] border px-4 py-5 text-[13px] leading-6 ${denseSurface} ${softText}`}>
            Лента новостей подключена, но посты ВКонтакте сейчас не загрузились. Откройте сообщество напрямую ниже.
          </div>
        )}
      </div>
      {newsFeedWidget ? (
        <a
          href={newsFeedWidget.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className={`mt-3 inline-flex items-center gap-1 text-xs transition ${isLightTheme ? "text-[#6558ff] hover:text-[#5445ff]" : "text-[#9b90ff] hover:text-[#c1bbff]"}`}
        >
          Открыть сообщество
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </section>
  );

  // Phones with a vertical clip get it as the whole first screen, with the platform
  // buttons laid over its darkened lower part — no scrolling to reach them.
  const phoneHero = data.snippetVideoUrl ? (
    <section className="relative h-[calc(100dvh-24px)] w-full overflow-hidden rounded-[28px] bg-black ring-1 ring-white/10 sm:h-[calc(100dvh-40px)] lg:hidden">
      <div className="sl-enter-cover absolute inset-0">
        <SmartLinkCoverVideo src={data.snippetVideoUrl} poster={data.coverUrl} title={data.title} media="(max-width: 1023px)" />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-b from-transparent via-black/50 to-black/90" />
      <div className="absolute left-3 top-3 z-[2]">
        <SmartLinkShareButton links={shareLinks} publicUrl={data.publicUrl} theme="dark" />
      </div>
      <div className="absolute inset-x-0 bottom-0 z-[1] flex max-h-[68%] flex-col gap-3 overflow-y-auto px-3.5 pb-4 text-white">
        {/* The snippet already shows the title; the page name stays for screen readers. */}
        <h1 className="sr-only">
          {data.title} — {data.artist}
        </h1>
        {presavePanel}
        {releaseLinksPanel}
      </div>
    </section>
  ) : null;

  return (
    <main
      className={`perf-scroll-shell relative h-[100dvh] overflow-x-hidden overflow-y-auto touch-pan-y px-2.5 py-3 [webkit-overflow-scrolling:touch] sm:px-4 sm:py-5 lg:px-8 ${
        isLightTheme ? "bg-[#f4f6fb] text-[#121620]" : "bg-[#090a10] text-white"
      }`}
    >
      {showCoverBackground ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.coverUrl ?? undefined}
            alt=""
            className={`absolute left-1/2 top-1/2 h-[138vmax] w-[138vmax] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover blur-[88px] saturate-[1.35] ${isLightTheme ? "opacity-48" : "opacity-62"}`}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.coverUrl ?? undefined}
            alt=""
            className={`absolute left-1/2 top-[38%] h-[92vmax] w-[92vmax] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover blur-[140px] ${isLightTheme ? "opacity-26" : "opacity-38"}`}
          />
          {!isLightTheme && liveBackgroundVariant && data.coverUrl ? (
            <div className={pageStyle === "film" ? "sepia-[0.45]" : undefined}>
              <SmartLinkLiveBackground coverUrl={data.coverUrl} variant={liveBackgroundVariant} />
            </div>
          ) : null}
          {pageStyle === "film" ? <div className="sl-film-grain absolute inset-0" /> : null}
          <div
            className={`absolute inset-0 ${
              isLightTheme
                ? "bg-[radial-gradient(circle_at_center,rgba(123,61,245,0.12),transparent_36%),linear-gradient(180deg,rgba(250,251,255,0.3),rgba(244,246,251,0.66)_18%,rgba(237,240,247,0.86)_100%)]"
                : "bg-[radial-gradient(circle_at_center,rgba(123,61,245,0.16),transparent_34%),linear-gradient(180deg,rgba(7,8,13,0.22),rgba(9,10,16,0.58)_18%,rgba(9,10,16,0.8)_100%)]"
            }`}
          />
        </div>
      ) : data.background === "plain" ? null : (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 ${
            isLightTheme
              ? "bg-[radial-gradient(circle_at_top,rgba(123,61,245,0.08),transparent_28%),linear-gradient(180deg,#f8f9fd_0%,#eef1f7_100%)]"
              : "bg-[radial-gradient(circle_at_top,rgba(123,61,245,0.18),transparent_28%),linear-gradient(180deg,#090a10_0%,#0d1017_100%)]"
          }`}
        />
      )}
      <SmartLinkViewTracker slug={data.publicSlug} />
      {pixelIds ? <SmartLinkPixels ids={pixelIds} /> : null}
      <div className={`relative z-[1] mx-auto max-w-[440px] pb-8 ${hasWideSnippet ? "lg:max-w-[620px]" : ""}`}>
        {phoneHero}
        <div className={`mb-3 justify-end ${hasPhoneSnippet ? "hidden lg:flex" : "flex"}`}>
          <SmartLinkShareButton links={shareLinks} publicUrl={data.publicUrl} theme={isLightTheme ? "light" : "dark"} />
        </div>
        {showCoverBackground ? (
          <div
            aria-hidden="true"
            className={`absolute left-1/2 top-[180px] h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-[120px] ${
              isLightTheme ? "bg-white/24" : "bg-[#5b4bff]/28"
            }`}
          />
        ) : null}
        <div className={`relative ${shellSurface}`}>
          {isLightTheme ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-0 h-24 rounded-full bg-[radial-gradient(circle,rgba(123,61,245,0.12)_0%,rgba(123,61,245,0.04)_46%,transparent_76%)] blur-3xl"
            />
          ) : null}
          <div className={`space-y-5 ${hasPhoneSnippet ? "mt-5 lg:mt-0" : ""}`}>
            {/* On phones with a vertical clip, the hero above already holds all of this. */}
            <div className={hasPhoneSnippet ? "hidden lg:block" : "contents"}>
            {hasNewsFeed ? (
              <SmartLinkPublicModeSwitcher
                coverContent={coverPanel}
                headerContent={headerPanel}
                releaseContent={
                  <div className="space-y-3">
                    {presavePanel}
                    {releaseLinksPanel}
                  </div>
                }
                newsContent={newsPanel}
                theme={isLightTheme ? "light" : "dark"}
              />
            ) : (
              <div className="space-y-5">
                {coverPanel}
                {headerPanel}
                <div className="space-y-2.5">
                  {presavePanel}
                  {releaseLinksPanel}
                </div>
              </div>
            )}
            </div>

              {data.sectionVisibility.videos && (coverVideoEmbedUrl || safeSmartLinkHref(data.coverVideoUrl)) ? (
                <section className={`rounded-[18px] border p-3 ${sectionSurface}`}>
                  <div className={`mb-3 flex items-center gap-2 text-sm font-semibold ${sectionText}`}>
                    <Video className="h-4 w-4" />
                    Видео на обложке
                  </div>
                  {coverVideoEmbedUrl ? (
                    <div className={`overflow-hidden rounded-[14px] border ${denseSurface}`}>
                      <iframe
                        src={coverVideoEmbedUrl}
                        title="Cover video"
                        className="aspect-video w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : safeSmartLinkHref(data.coverVideoUrl) ? (
                    <a
                      href={safeSmartLinkHref(data.coverVideoUrl) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${cardSurface}`}
                    >
                      Открыть видео
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </section>
              ) : null}

              {data.sectionVisibility.videos && inlineVideos.length > 0 ? (
                <section className={`rounded-[18px] border p-3 ${sectionSurface}`}>
                  <div className={`mb-3 flex items-center gap-2 text-sm font-semibold ${sectionText}`}>
                    <Video className="h-4 w-4" />
                    Видео
                  </div>
                  <div className="space-y-2.5">
                    {inlineVideos.map((item) => {
                      const embedUrl = buildEmbedUrl(item.url);
                      return (
                        <div key={item.id} className={`rounded-[14px] border p-2.5 ${denseSurface}`}>
                          {item.title ? <div className={`mb-2 text-sm font-medium ${sectionText}`}>{item.title}</div> : null}
                          {embedUrl ? (
                            <div className={`overflow-hidden rounded-[12px] border ${denseSurface}`}>
                              <iframe
                                src={embedUrl}
                                title={item.title || "Inline video"}
                                className="aspect-video w-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                          ) : (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${cardSurface}`}
                            >
                              Открыть видео
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {data.sectionVisibility.credits && creditSections.length > 0 ? (
                <section className={`rounded-[18px] border p-3 ${sectionSurface}`}>
                  <div className={`mb-3 text-sm font-semibold ${sectionText}`}>Авторы</div>
                  <div className="space-y-2.5">
                    {creditSections.map((section) => (
                      <div key={section.key} className={`rounded-[14px] border p-2.5 ${denseSurface}`}>
                        <div className={`text-sm font-semibold ${sectionText}`}>{section.title}</div>
                        <div className={`mt-1 text-xs ${mutedText}`}>{section.description}</div>
                        <div className="mt-2.5 space-y-1.5">
                          {section.rows.map((row) => (
                            <div key={row.id} className={`rounded-[12px] border px-3 py-2 ${rowSurface}`}>
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                {row.name ? <span className={`font-medium ${sectionText}`}>{row.name}</span> : null}
                                {row.role ? <span className={mutedText}>{row.role}</span> : null}
                              </div>
                              {safeSmartLinkHref(row.link) ? (
                                <a
                                  href={safeSmartLinkHref(row.link) ?? undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`mt-1 inline-flex items-center gap-1 text-xs transition ${isLightTheme ? "text-[#6558ff] hover:text-[#5445ff]" : "text-[#9b90ff] hover:text-[#c1bbff]"}`}
                                >
                                  Открыть ссылку
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="grid gap-2">
                {data.sectionVisibility.contacts ? (
                  <section className={`rounded-[18px] border p-3 ${sectionSurface}`}>
                    <div className={`mb-3 flex items-center gap-2 text-sm font-semibold ${sectionText}`}>
                      <Mail className="h-4 w-4" />
                      Контакты
                    </div>
                    <div className="space-y-1.5">
                      {contactEntriesWithValue.length > 0 ? (
                        contactEntriesWithValue.map((item) => {
                          const value = item.value.trim();
                          const href = isExternalHref(value) ? value : isEmailValue(value) ? `mailto:${value}` : null;
                          return (
                            <div key={item.id} className={`rounded-[12px] border px-3 py-2 ${rowSurface}`}>
                              <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${mutedText}`}>{item.label}</div>
                              {href ? (
                                <a
                                  href={href}
                                  target={href.startsWith("http") ? "_blank" : undefined}
                                  rel={href.startsWith("http") ? "noreferrer" : undefined}
                                  className={`mt-1 inline-flex break-all text-sm transition ${isLightTheme ? "text-[#6558ff] hover:text-[#5445ff]" : "text-[#9b90ff] hover:text-[#c1bbff]"}`}
                                >
                                  {value}
                                </a>
                              ) : (
                                <div className={`mt-1 break-all text-sm ${sectionText}`}>{value}</div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className={`rounded-[12px] border px-3 py-2 text-sm ${rowSurface} ${sectionText}`}>Не указано</div>
                      )}
                    </div>
                  </section>
                ) : null}

                {data.sectionVisibility.socials ? (
                  <section className={`rounded-[18px] border p-3 ${sectionSurface}`}>
                    <div className={`flex items-center gap-2 text-sm font-semibold ${sectionText}`}>
                      <Send className="h-4 w-4" />
                      Follow
                    </div>
                    {followEntries.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {followEntries.map(([key, value]) => (
                          <a
                            key={key}
                            href={value}
                            target="_blank"
                            rel="noreferrer"
                            className={`rounded-full border px-3 py-2 text-sm transition ${cardSurface}`}
                          >
                            {key}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className={`mt-3 rounded-[12px] border px-3 py-2 text-sm ${rowSurface} ${sectionText}`}>Не указано</div>
                    )}
                  </section>
                ) : null}
              </div>

              {/* Listeners of a release are often musicians themselves: invite them to release their own track. */}
              <Link
                href={`/register?utm_source=smartlink&utm_medium=referral&utm_campaign=release_cta&utm_content=${encodeURIComponent(data.publicSlug)}`}
                aria-label="Выпусти свой первый трек с ICECREAMMUSIC"
                className={`group mt-4 flex items-center gap-3 rounded-[18px] border p-3 transition ${
                  isLightTheme
                    ? "border-black/8 bg-white/80 hover:border-black/15 hover:bg-white"
                    : "border-white/10 bg-[linear-gradient(135deg,rgba(123,97,255,0.16),rgba(255,255,255,0.03))] hover:border-white/20"
                }`}
              >
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-[13px] ${
                    isLightTheme ? "bg-black/[0.04]" : "bg-white/[0.06]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/logo.png" alt="" className="h-7 w-auto object-contain" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] font-semibold leading-tight ${sectionText}`}>
                    Выпусти свой первый трек
                  </span>
                  <span className={`mt-0.5 block text-[12px] leading-snug ${mutedText}`}>
                    Яндекс Музыка, VK Музыка и ещё 240+ площадок с ICECREAMMUSIC
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white transition group-hover:brightness-110"
                  style={{ background: "#7b61ff" }}
                >
                  Начать
                </span>
              </Link>
            </div>
          </div>
        </div>
    </main>
  );
}
