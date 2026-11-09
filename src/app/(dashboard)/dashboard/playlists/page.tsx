"use client";

import * as React from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import {
  DashboardEmptyState,
  DashboardShell,
  PageSection
} from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";

interface Placement {
  id: string;
  platform: string;
  upc: string;
  artistName: string;
  trackTitle: string;
  position: string | null;
  playlistName: string;
  playlistUrl: string;
  playlistCoverUrl: string | null;
  playlistFollowers: number | null;
  createdAt: string;
}

function getPlatformName(platform: string) {
  switch (platform) {
    case "VK":
      return "VK Музыка";
    case "YANDEX":
      return "Яндекс Музыка";
    case "APPLE":
      return "Apple Music";
    case "SPOTIFY":
      return "Spotify";
    default:
      return platform;
  }
}

const NUMBER = new Intl.NumberFormat("ru-RU");

const PLATFORM_ICONS: Record<string, string> = {
  YANDEX: "/landing/platforms/yandex-music.png",
  VK: "/landing/platforms/vk-music.png",
  APPLE: "/landing/platforms/apple-music.png",
  SPOTIFY: "/landing/platforms/spotify.png"
};

/** Same playlist, same colours: a stable number from the link. */
function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  // Final mix so links that differ only in the last digits still land on different colours.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Light spot, second spot, background — soft pairs that sit well on the dark cabinet. */
const COVER_PALETTES: Array<[string, string, string]> = [
  ["#f9a8d4", "#a855f7", "linear-gradient(135deg, #2e1065, #1e1b4b)"],
  ["#7dd3fc", "#6366f1", "linear-gradient(135deg, #172554, #0f172a)"],
  ["#fcd34d", "#f97316", "linear-gradient(135deg, #431407, #1c1917)"],
  ["#6ee7b7", "#0ea5e9", "linear-gradient(135deg, #042f2e, #0c1a2b)"],
  ["#fda4af", "#e11d48", "linear-gradient(135deg, #4c0519, #1f0a14)"],
  ["#c4b5fd", "#8b5cf6", "linear-gradient(135deg, #1e1b4b, #0b0b1a)"],
  ["#a5f3fc", "#14b8a6", "linear-gradient(135deg, #134e4a, #0f1d1c)"],
  ["#fdba74", "#db2777", "linear-gradient(135deg, #3b0764, #1a0b16)"]
];

/** A calm abstract cover for playlists whose platform gave no picture. */
function GeneratedCover({ seed, platform }: { seed: string; platform: string }) {
  const hash = hashSeed(seed);
  const [light, mid, base] = COVER_PALETTES[hash % COVER_PALETTES.length]!;
  const x = 20 + ((hash >>> 5) % 60);
  const y = 15 + ((hash >>> 13) % 55);
  const icon = PLATFORM_ICONS[platform];
  return (
    <span
      aria-hidden
      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[14px] sm:h-[136px] sm:w-[136px]"
      style={{
        background: `radial-gradient(circle at ${x}% ${y}%, ${light}, transparent 55%),
          radial-gradient(circle at ${100 - x}% ${100 - y / 2}%, ${mid}, transparent 62%),
          ${base}`
      }}
    >
      <span
        className="absolute -bottom-1/3 -right-1/3 h-[110%] w-[110%] rounded-full opacity-30"
        style={{
          background:
            "repeating-radial-gradient(circle, rgba(255,255,255,0.35) 0 1px, transparent 1px 7px)"
        }}
      />
      <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(0,0,0,0.25))]" />
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static icon
        <img src={icon} alt="" className="absolute right-2 top-2 h-5 w-5 rounded-md opacity-90 shadow" />
      ) : null}
    </span>
  );
}

function PlaylistCover({ placement }: { placement: Placement }) {
  const [broken, setBroken] = React.useState(false);
  if (placement.playlistCoverUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote platform covers, not optimised by next/image
      <img
        src={placement.playlistCoverUrl}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-24 w-24 shrink-0 rounded-[14px] object-cover sm:h-[136px] sm:w-[136px]"
      />
    );
  }
  return <GeneratedCover seed={placement.playlistUrl || placement.playlistName} platform={placement.platform} />;
}

function PlaylistCard({ placement }: { placement: Placement }) {
  return (
    <a
      href={placement.playlistUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex gap-4 rounded-[22px] border border-white/[0.06] bg-white/[0.035] p-4 transition hover:bg-white/[0.06] sm:gap-5 sm:p-5"
    >
      <PlaylistCover placement={placement} />
      <div className="min-w-0 flex-1 pr-6">
        <p className="flex items-center gap-1.5 text-[13px] text-white/60">
          {PLATFORM_ICONS[placement.platform] ? (
            // eslint-disable-next-line @next/next/no-img-element -- tiny static icon
            <img src={PLATFORM_ICONS[placement.platform]} alt="" className="h-4 w-4 rounded" />
          ) : null}
          {getPlatformName(placement.platform)}
        </p>
        <p className="mt-1 truncate text-[18px] font-semibold tracking-[-0.01em] text-white sm:text-[20px]">
          {placement.playlistName}
        </p>
        <p className="mt-1.5 truncate text-[14px] text-white/85">{placement.trackTitle || "—"}</p>
        <p className="truncate text-[14px] text-white/50">{placement.artistName || ""}</p>
        <dl className="mt-3 flex gap-8 text-[13px]">
          {placement.position ? (
            <div>
              <dt className="text-white/50">Позиция</dt>
              <dd className="mt-0.5 text-[16px] tabular-nums text-white">{placement.position} место</dd>
            </div>
          ) : null}
          {placement.playlistFollowers !== null ? (
            <div>
              <dt className="text-white/50">Подписчиков</dt>
              <dd className="mt-0.5 text-[16px] tabular-nums text-white">{NUMBER.format(placement.playlistFollowers)}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <ExternalLink className="absolute right-4 top-4 h-4 w-4 text-white/45 transition group-hover:text-white sm:right-5 sm:top-5" />
    </a>
  );
}

export default function UserPlaylistsPage() {
  const [placements, setPlacements] = React.useState<Placement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/playlists", {
          cache: "no-store",
          signal: controller.signal
        });
        const data = (await response.json().catch(() => null)) as
          | { placements?: Placement[]; error?: string }
          | null;

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Сессия истекла. Войдите снова, чтобы увидеть плейлисты.");
          }
          throw new Error(data?.error ?? "Не удалось загрузить плейлисты.");
        }

        setPlacements(Array.isArray(data?.placements) ? data.placements : []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(
          loadError instanceof Error ? loadError.message : "Не удалось загрузить плейлисты."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return (
    <DashboardShell>
      <PageHeader
        title="Плейлисты"
        description="Треки, которые попали в редакторские плейлисты площадок."
      />

      {error ? (
        <PageSection>
          <div className="ux-error rounded-[22px] px-4 py-3 text-sm text-rose-100">{error}</div>
        </PageSection>
      ) : null}

      {isLoading ? (
        <PageSection>
          <div className="flex min-h-[240px] items-center justify-center gap-3 text-sm font-medium text-white/58">
            <Loader2 className="h-4 w-4 animate-spin text-[#a99bff]" />
            Загружаем плейлисты...
          </div>
        </PageSection>
      ) : placements.length === 0 ? (
        <DashboardEmptyState
          title="Пока нет плейлистов"
          description="Как только ваши треки попадут в редакторские плейлисты площадок, они появятся здесь."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {placements.map((placement) => (
            <PlaylistCard key={placement.id} placement={placement} />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
