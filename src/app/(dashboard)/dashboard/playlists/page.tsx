"use client";

import * as React from "react";
import { ExternalLink, Loader2, Music2 } from "lucide-react";

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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
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
        description="Здесь отображаются треки, которые уже попали в редакторские или кураторские плейлисты площадок. Данные читаются из защищённого /api/playlists."
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
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {placements.map((placement) => (
            <PageSection key={placement.id} className="flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="ux-surface-soft inline-flex h-10 w-10 items-center justify-center rounded-2xl text-[#d7d0ff]">
                      <Music2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {getPlatformName(placement.platform)}
                      </p>
                      <p className="truncate text-xs font-medium text-white/42">
                        Добавлено {formatDate(placement.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
                {placement.position ? (
                  <span className="ux-pill inline-flex h-9 items-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d7d0ff]">
                    #{placement.position}
                  </span>
                ) : null}
              </div>

              <div className="ux-surface-soft rounded-[22px] p-4">
                <p className="text-lg font-semibold tracking-[-0.02em] text-white">
                  {placement.playlistName}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/66">
                  {placement.artistName} — {placement.trackTitle}
                </p>
              </div>

              <dl className="grid gap-3 text-sm text-white/64 sm:grid-cols-2">
                <div className="ux-surface-soft rounded-[18px] p-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">UPC</dt>
                  <dd className="mt-1 font-medium text-white/78">{placement.upc || "—"}</dd>
                </div>
                <div className="ux-surface-soft rounded-[18px] p-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Позиция</dt>
                  <dd className="mt-1 font-medium text-white/78">{placement.position ?? "Без позиции"}</dd>
                </div>
              </dl>

              <a
                href={placement.playlistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ux-control-compact mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-[18px] px-4 text-sm font-semibold text-white/78 transition hover:text-white"
              >
                <ExternalLink className="h-4 w-4" />
                Открыть плейлист
              </a>
            </PageSection>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
