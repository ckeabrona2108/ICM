import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Mail, Music2, Send, Video } from "lucide-react";

import { SmartLinkPlatformIcon } from "@/components/smart-link/platform-icon";
import { SmartLinkPublicModeSwitcher } from "@/components/smart-link/smart-link-public-mode-switcher";
import { SmartLinkShareButton } from "@/components/smart-link/smart-link-share-button";
import { SmartLinkViewTracker } from "@/components/smart-link/smart-link-view-tracker";
import { SMART_LINK_PRIMARY_PLATFORM_CODES } from "@/lib/smart-link-platforms";
import { getSmartLinkPublicView } from "@/lib/smart-link-service";

export const dynamic = "force-dynamic";

function buildEmbedUrl(url: string): string | null {
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
  const data = await getSmartLinkPublicView(params.slug);
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
  const data = await getSmartLinkPublicView(params.slug);
  if (!data) {
    notFound();
  }

  const passthroughParams = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(searchParams ?? {})) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value && key.startsWith("utm_")) passthroughParams.set(key, value);
  }
  const queryString = passthroughParams.toString();
  const activeButtons = data.platforms
    .filter((item) => item.status === "live" && (item.url?.trim().length ?? 0) > 0)
    .slice();
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
  const followEntries = Object.entries(data.followLinks).filter(([, value]) => value.trim().length > 0);
  const newsFeedWidget = data.newsFeedWidget;
  const hasNewsFeed =
    data.sectionVisibility.newsFeed &&
    (data.newsFeedPosts.length > 0 || Boolean(newsFeedWidget) || data.newsFeedLinks.vk.trim().length > 0);
  const coverVideoEmbedUrl = buildEmbedUrl(data.coverVideoUrl);
  const inlineVideos = normalizePublicItems(data.inlineVideos).filter((item) => item.url.trim().length > 0);
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
  const pixels = normalizePublicItems(data.pixels).filter(
    (item) => item.label.trim().length > 0 || item.value.trim().length > 0
  );
  const isLightTheme = data.theme === "light";
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
  const shellSurface = isLightTheme
    ? "border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,249,253,0.98))] text-[#121620] shadow-[0_36px_120px_-56px_rgba(58,71,105,0.22)]"
    : "border-white/10 bg-[linear-gradient(180deg,rgba(17,18,28,0.84),rgba(11,13,21,0.88))] text-white shadow-[0_30px_120px_-60px_rgba(91,75,255,0.28)]";
  const cardSurface = isLightTheme
    ? "border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(249,250,253,0.96))] text-[#161b24] shadow-[0_16px_38px_-30px_rgba(72,86,122,0.26)] hover:border-black/14 hover:bg-white"
    : "border-white/12 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.07]";
  const disabledCardSurface = isLightTheme
    ? "cursor-default border-black/6 bg-white/[0.58] text-black/40"
    : "cursor-default border-white/8 bg-white/[0.02] text-white/45";
  const badgeSurface = isLightTheme
    ? "border-[#7b6cff]/18 bg-[#7b6cff]/[0.08] text-[#5a4dcb]"
    : "border-white/10 bg-white/[0.04] text-white/60";
  const soonSurface = isLightTheme
    ? "border-[#7b6cff]/26 bg-[#7b6cff]/12 text-[#695cff]"
    : "border-[#7b6cff]/45 bg-[#7b6cff]/14 text-[#b4acff]";
  const platformCardSurface = isLightTheme
    ? "border-black/[0.04] bg-white text-[#3c3c3c] shadow-[0_12px_28px_-24px_rgba(72,86,122,0.18)] hover:bg-white"
    : "border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.04))] text-white shadow-[0_20px_48px_-34px_rgba(0,0,0,0.45)] hover:border-white/20 hover:bg-white/[0.08]";
  const platformActionClass = isLightTheme
    ? "bg-[#ff2140] text-white shadow-[0_18px_36px_-24px_rgba(255,33,64,0.6)] hover:bg-[#ff1838]"
    : "bg-[#ff2140] text-white shadow-[0_18px_36px_-24px_rgba(255,33,64,0.45)] hover:bg-[#ff1838]";
  const coverPanel = (
    <div
      className={`mx-auto w-full max-w-[228px] overflow-hidden rounded-[18px] border ${
        isLightTheme
          ? "border-black/8 bg-[radial-gradient(circle_at_top,rgba(123,61,245,0.1),transparent_48%),rgba(255,255,255,0.78)]"
          : "border-white/10 bg-[radial-gradient(circle_at_top,rgba(123,61,245,0.18),transparent_48%),rgba(255,255,255,0.03)]"
      }`}
    >
      {data.coverUrl ? (
        <div className="relative flex aspect-square items-center justify-center p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.coverUrl}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full scale-110 object-cover blur-2xl ${isLightTheme ? "opacity-26" : "opacity-35"}`}
          />
          <div
            className={`absolute inset-0 ${
              isLightTheme
                ? "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.2))]"
                : "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%),linear-gradient(180deg,rgba(9,10,16,0.08),rgba(9,10,16,0.34))]"
            }`}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.coverUrl} alt={data.title} className="relative z-[1] h-full w-full rounded-[14px] object-contain" />
        </div>
      ) : (
        <div className="flex aspect-square items-center justify-center bg-white/[0.04] text-white/40">
          <Music2 className="h-12 w-12" />
        </div>
      )}
    </div>
  );

  const headerPanel = (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] ${badgeSurface}`}>
          Smart Link
        </div>
        <SmartLinkShareButton links={shareLinks} publicUrl={data.publicUrl} theme={isLightTheme ? "light" : "dark"} />
      </div>
      <h1 className={`mt-2 text-[1.52rem] font-semibold tracking-[-0.045em] sm:text-[1.92rem] ${sectionText}`}>{data.title}</h1>
      <div className={`mt-2 flex flex-wrap items-center gap-1.5 text-[12px] sm:text-[13px] ${softText}`}>
        <span>{data.artist}</span>
        <span>•</span>
        <span>{data.releaseDate}</span>
        {data.explicit ? (
          <>
            <span>•</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${badgeSurface}`}>Explicit</span>
          </>
        ) : null}
      </div>
    </div>
  );

  const releaseLinksPanel = data.sectionVisibility.links ? (
    <div className="grid gap-3">
      {activeButtons.map((item) => {
        const href = `/l/${encodeURIComponent(data.publicSlug)}/go/${encodeURIComponent(item.code)}${queryString ? `?${queryString}` : ""}`;
        return (
          <a
            key={item.code}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={`group flex items-center justify-between gap-4 overflow-hidden rounded-[20px] border px-[18px] py-[18px] transition ${platformCardSurface}`}
          >
            <span className="flex min-w-0 items-center gap-4">
              <SmartLinkPlatformIcon code={item.code} size={24} />
              <span className="block min-w-0 truncate text-[16px] font-normal leading-6 tracking-0">{item.label}</span>
            </span>
            <span className={`inline-flex h-12 shrink-0 items-center justify-center rounded-[20px] px-6 text-[16px] font-semibold transition sm:px-10 ${platformActionClass}`}>
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
              {post.text ? <p className={`mt-2 whitespace-pre-line text-[14px] leading-6 ${sectionText}`}>{post.text}</p> : null}
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

  return (
    <main
      className={`perf-scroll-shell relative h-[100dvh] overflow-x-hidden overflow-y-auto touch-pan-y px-2.5 py-3 [webkit-overflow-scrolling:touch] sm:px-4 sm:py-5 lg:px-8 ${
        isLightTheme ? "bg-[#f4f6fb] text-[#121620]" : "bg-[#090a10] text-white"
      }`}
    >
      {data.coverUrl ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.coverUrl}
            alt=""
            className={`absolute left-1/2 top-1/2 h-[138vmax] w-[138vmax] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover blur-[88px] saturate-[1.35] ${isLightTheme ? "opacity-48" : "opacity-62"}`}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.coverUrl}
            alt=""
            className={`absolute left-1/2 top-[38%] h-[92vmax] w-[92vmax] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover blur-[140px] ${isLightTheme ? "opacity-26" : "opacity-38"}`}
          />
          <div
            className={`absolute inset-0 ${
              isLightTheme
                ? "bg-[radial-gradient(circle_at_center,rgba(123,61,245,0.12),transparent_36%),linear-gradient(180deg,rgba(250,251,255,0.3),rgba(244,246,251,0.66)_18%,rgba(237,240,247,0.86)_100%)]"
                : "bg-[radial-gradient(circle_at_center,rgba(123,61,245,0.16),transparent_34%),linear-gradient(180deg,rgba(7,8,13,0.22),rgba(9,10,16,0.58)_18%,rgba(9,10,16,0.8)_100%)]"
            }`}
          />
        </div>
      ) : (
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
      <div className="relative z-[1] mx-auto max-w-[520px] pb-8">
        {data.coverUrl ? (
          <div
            aria-hidden="true"
            className={`absolute left-1/2 top-[180px] h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-[120px] ${
              isLightTheme ? "bg-white/24" : "bg-[#5b4bff]/28"
            }`}
          />
        ) : null}
        <div className={`relative overflow-hidden rounded-[22px] border p-3 backdrop-blur-[10px] sm:p-4 ${shellSurface}`}>
          {isLightTheme ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-0 h-24 rounded-full bg-[radial-gradient(circle,rgba(123,61,245,0.12)_0%,rgba(123,61,245,0.04)_46%,transparent_76%)] blur-3xl"
            />
          ) : null}
          <div className="space-y-3.5">
            {hasNewsFeed ? (
              <SmartLinkPublicModeSwitcher
                coverContent={coverPanel}
                headerContent={headerPanel}
                releaseContent={<div className="space-y-3">{releaseLinksPanel}</div>}
                newsContent={newsPanel}
              />
            ) : (
              <>
                {coverPanel}
                {headerPanel}
                <div className="space-y-3">{releaseLinksPanel}</div>
              </>
            )}

              {data.sectionVisibility.videos && data.coverVideoUrl ? (
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
                  ) : (
                    <a
                      href={data.coverVideoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${cardSurface}`}
                    >
                      Открыть видео
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
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
                              {row.link ? (
                                <a
                                  href={row.link}
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

              {data.sectionVisibility.pixels && pixels.length > 0 ? (
                <section className={`rounded-[18px] border p-3 ${sectionSurface}`}>
                  <div className={`mb-3 text-sm font-semibold ${sectionText}`}>Пиксель</div>
                  <div className="space-y-1.5">
                    {pixels.map((item) => (
                      <div key={item.id} className={`rounded-[12px] border px-3 py-2 ${rowSurface}`}>
                        <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${mutedText}`}>{item.label}</div>
                        <div className={`mt-1 break-all text-sm ${sectionText}`}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <Link
                href="/"
                className={`block w-full overflow-hidden rounded-[20px] border px-4 py-3.5 transition ${denseSurface} ${isLightTheme ? "hover:border-black/14 hover:bg-white" : "hover:border-white/18 hover:bg-white/[0.05]"}`}
              >
                <span className="flex items-center justify-center gap-3 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/smart-link-logo.png"
                    alt="ICECREAMMUSIC"
                    className="h-11 w-11 shrink-0 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.24)]"
                  />
                  <span>
                    <span className={`block text-[10px] uppercase tracking-[0.34em] ${mutedText}`}>Powered by</span>
                    <span className={`mt-1 block text-sm font-semibold tracking-[0.22em] ${sectionText}`}>ICECREAMMUSIC</span>
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </div>
    </main>
  );
}
