import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Music2, Send, Share2 } from "lucide-react";

import { SmartLinkCopyButton } from "@/components/smart-link/smart-link-copy-button";
import { SmartLinkViewTracker } from "@/components/smart-link/smart-link-view-tracker";
import { getSmartLinkPublicView } from "@/lib/smart-link-service";

export const dynamic = "force-dynamic";

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
  const activeButtons = data.platforms.filter((item) => item.status !== "hidden");
  const shareLinks = [
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodeURIComponent(data.publicUrl)}&text=${encodeURIComponent(`${data.artist} — ${data.title}`)}`
    },
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${data.artist} — ${data.title} ${data.publicUrl}`)}`
    },
    {
      label: "VK",
      href: `https://vk.com/share.php?url=${encodeURIComponent(data.publicUrl)}`
    }
  ];
  const followEntries = Object.entries(data.followLinks).filter(([, value]) => value.trim().length > 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(123,61,245,0.18),transparent_28%),linear-gradient(180deg,#090a10_0%,#0d1017_100%)] px-4 py-8 text-white sm:px-6 lg:px-8">
      <SmartLinkViewTracker slug={data.publicSlug} />
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,18,28,0.92),rgba(11,13,21,0.88))] p-5 shadow-[0_30px_120px_-60px_rgba(91,75,255,0.35)] sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]">
              {data.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.coverUrl} alt={data.title} className="aspect-square h-full w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-white/[0.04] text-white/40">
                  <Music2 className="h-12 w-12" />
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                  Smart Link
                </div>
                <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                  {data.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/68">
                  <span>{data.artist}</span>
                  <span>•</span>
                  <span>{data.releaseDate}</span>
                  <span>•</span>
                  <span>{data.genre}</span>
                  {data.explicit ? (
                    <>
                      <span>•</span>
                      <span className="rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 text-[11px] font-semibold uppercase text-white/72">
                        Explicit
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {activeButtons.map((item) => {
                  const href =
                    item.status === "live"
                      ? `/l/${encodeURIComponent(data.publicSlug)}/go/${encodeURIComponent(item.code)}${queryString ? `?${queryString}` : ""}`
                      : "#";
                  return (
                    <a
                      key={item.code}
                      href={href}
                      className={`group flex items-center justify-between rounded-2xl border px-4 py-3.5 transition ${
                        item.status === "live"
                          ? "border-white/12 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
                          : "cursor-default border-white/8 bg-white/[0.02] text-white/45"
                      }`}
                    >
                      <span className="font-medium">{item.label}</span>
                      {item.status === "live" ? (
                        <ExternalLink className="h-4 w-4 text-white/55 transition group-hover:text-white/80" />
                      ) : (
                        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">Скоро</span>
                      )}
                    </a>
                  );
                })}

                {data.waveDownloadUrl ? (
                  <a
                    href={data.waveDownloadUrl}
                    className="group flex items-center justify-between rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3.5 transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <span className="font-medium">Скачать WAV</span>
                    <ExternalLink className="h-4 w-4 text-white/55 transition group-hover:text-white/80" />
                  </a>
                ) : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                    <Send className="h-4 w-4" />
                    Follow
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {followEntries.length > 0 ? (
                      followEntries.map(([key, value]) => (
                        <a
                          key={key}
                          href={value}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/72 transition hover:bg-white/[0.07] hover:text-white"
                        >
                          {key}
                        </a>
                      ))
                    ) : (
                      <p className="text-sm text-white/45">Социальные ссылки будут добавлены артистом позже.</p>
                    )}
                  </div>
                </section>

                <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
                    <Share2 className="h-4 w-4" />
                    Поделиться
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shareLinks.map((item) => (
                      <a
                        key={item.label}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/72 transition hover:bg-white/[0.07] hover:text-white"
                      >
                        {item.label}
                      </a>
                    ))}
                    <SmartLinkCopyButton url={data.publicUrl} />
                  </div>
                </section>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                Опубликовано через ICECREAMMUSIC. Все ссылки на площадки собираются в одном месте для продвижения релиза.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center">
          <Link href="/" className="text-sm text-white/45 transition hover:text-white/70">
            ICECREAMMUSIC
          </Link>
        </div>
      </div>
    </main>
  );
}
