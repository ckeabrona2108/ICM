"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, ExternalLink, Save } from "lucide-react";

import type {
  SmartLinkFollowLinks,
  SmartLinkOwnerView,
  SmartLinkPlatformConfig,
  SmartLinkPlatformStatus,
  SmartLinkTheme
} from "@/lib/smart-link-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface SmartLinkSettingsClientProps {
  releaseId: string;
  initialData: SmartLinkOwnerView;
}

export function SmartLinkSettingsClient({
  releaseId,
  initialData
}: SmartLinkSettingsClientProps) {
  const [slug, setSlug] = React.useState(initialData.publicSlug);
  const [theme, setTheme] = React.useState<SmartLinkTheme>(initialData.theme);
  const [allowWaveDownload, setAllowWaveDownload] = React.useState(initialData.allowWaveDownload);
  const [platforms, setPlatforms] = React.useState<SmartLinkPlatformConfig[]>(initialData.platforms);
  const [followLinks, setFollowLinks] = React.useState<SmartLinkFollowLinks>(initialData.followLinks);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [publicUrl, setPublicUrl] = React.useState(initialData.publicUrl);

  const analytics = initialData.analytics;

  const updatePlatform = React.useCallback(
    (code: string, patch: Partial<SmartLinkPlatformConfig>) => {
      setPlatforms((current) =>
        current.map((item) => (item.code === code ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const save = React.useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/smart-link`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          slug,
          theme,
          allowWaveDownload,
          platforms: platforms.map((item) => ({
            code: item.code,
            status: item.status,
            url: item.url
          })),
          followLinks
        })
      });

      const payload = (await response.json().catch(() => null)) as SmartLinkOwnerView | { error?: string } | null;
      if (!response.ok || !payload || !("publicUrl" in payload)) {
        setError((payload && "error" in payload && payload.error) || "Не удалось сохранить настройки.");
        return;
      }

      setSlug(payload.publicSlug);
      setTheme(payload.theme);
      setAllowWaveDownload(payload.allowWaveDownload);
      setPlatforms(payload.platforms);
      setFollowLinks(payload.followLinks);
      setPublicUrl(payload.publicUrl);
      setSuccess("Smart Link обновлён.");
    } catch {
      setError("Не удалось сохранить настройки.");
    } finally {
      setSaving(false);
    }
  }, [allowWaveDownload, followLinks, platforms, releaseId, slug, theme]);

  return (
    <div className="space-y-6 pb-10">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Публичный Smart Link</CardTitle>
            <p className="mt-2 text-sm text-white/60">
              Главная ссылка для продвижения релиза. Открывается даже если часть площадок ещё в статусе «Скоро».
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm font-medium text-white/82 transition hover:bg-white/[0.07]"
            >
              <ExternalLink className="h-4 w-4" />
              Открыть
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(publicUrl).catch(() => null);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm font-medium text-white/82 transition hover:bg-white/[0.07]"
            >
              <Copy className="h-4 w-4" />
              Копировать
            </button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.8fr_0.8fr]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Slug</label>
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="artist-song" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Theme</label>
            <Select
              value={theme}
              onChange={(event) => setTheme(event.target.value as SmartLinkTheme)}
              options={[
                { label: "Dark", value: "dark" },
                { label: "Light", value: "light" },
                { label: "Auto", value: "auto" }
              ]}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">WAV</label>
            <Select
              value={allowWaveDownload ? "enabled" : "disabled"}
              onChange={(event) => setAllowWaveDownload(event.target.value === "enabled")}
              options={[
                { label: "Скрыть", value: "disabled" },
                { label: "Показывать", value: "enabled" }
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Площадки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {platforms.map((item) => (
            <div
              key={item.code}
              className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 lg:grid-cols-[1fr_0.9fr_120px]"
            >
              <div>
                <p className="font-medium text-white">{item.label}</p>
                <p className="mt-1 text-sm text-white/45">{item.code}</p>
              </div>
              <Input
                value={item.url ?? ""}
                onChange={(event) => updatePlatform(item.code, { url: event.target.value })}
                placeholder="https://..."
              />
              <Select
                value={item.status}
                onChange={(event) =>
                  updatePlatform(item.code, { status: event.target.value as SmartLinkPlatformStatus })
                }
                options={[
                  { label: "Live", value: "live" },
                  { label: "Soon", value: "soon" },
                  { label: "Hidden", value: "hidden" }
                ]}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {Object.entries(followLinks).map(([key, value]) => (
            <div key={key} className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">{key}</label>
              <Input
                value={value}
                onChange={(event) =>
                  setFollowLinks((current) => ({
                    ...current,
                    [key]: event.target.value
                  }))
                }
                placeholder="https://..."
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Краткая аналитика</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Просмотры" value={String(analytics.totalViews)} />
          <MetricCard label="Переходы" value={String(analytics.totalClicks)} />
          <MetricCard
            label="Топ источник"
            value={
              Object.entries(analytics.sourceClicks).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "—"
            }
          />
          <MetricCard
            label="Топ площадка"
            value={
              Object.entries(analytics.platformClicks).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "—"
            }
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Сохраняем..." : "Сохранить Smart Link"}
        </Button>
        <Link href={`/dashboard/releases/${encodeURIComponent(releaseId)}`} className="text-sm text-white/55 transition hover:text-white/78">
          Назад к релизу
        </Link>
        {error ? <span className="text-sm text-rose-300">{error}</span> : null}
        {success ? <span className="text-sm text-emerald-300">{success}</span> : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
