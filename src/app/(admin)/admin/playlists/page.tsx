"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle, ExternalLink, FileUp, Link2, Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface Placement {
  id: string;
  platform: string;
  artistName: string | null;
  trackTitle: string | null;
  position: string | null;
  playlistName: string;
  playlistUrl: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string } | null;
  release: { id: string; title: string } | null;
}

interface UploadResult {
  ok?: boolean;
  added?: number;
  updated?: number;
  removed?: number;
  skipped?: number;
  unmatched?: Array<{ artistName: string; trackTitle: string; playlistName: string }>;
  error?: string;
}

const PLATFORM_OPTIONS = [
  { label: "Определить по ссылкам", value: "" },
  { label: "Яндекс Музыка", value: "YANDEX" },
  { label: "VK Музыка", value: "VK" },
  { label: "Apple Music", value: "APPLE" },
  { label: "Spotify", value: "SPOTIFY" }
];

const PLATFORM_NAMES: Record<string, string> = {
  YANDEX: "Яндекс Музыка",
  VK: "VK Музыка",
  APPLE: "Apple Music",
  SPOTIFY: "Spotify"
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
}

export default function AdminPlaylistsPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [platform, setPlatform] = React.useState("");
  const [removeMissing, setRemoveMissing] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [result, setResult] = React.useState<UploadResult | null>(null);
  const [fileInputKey, setFileInputKey] = React.useState(0);

  const [placements, setPlacements] = React.useState<Placement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [onlyUnlinked, setOnlyUnlinked] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);

  const loadPlacements = React.useCallback(async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/admin/playlists", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { placements?: Placement[]; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
      setPlacements(data?.placements ?? []);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Не удалось загрузить список.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadPlacements();
  }, [loadPlacements]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    if (removeMissing && !window.confirm("Убрать из списка все треки этой площадки, которых нет в файле?")) return;

    setIsUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("platform", platform);
    if (removeMissing) formData.append("removeMissing", "1");

    try {
      const res = await fetch("/api/admin/playlists/upload", { method: "POST", body: formData });
      const data = (await res.json().catch(() => null)) as UploadResult | null;
      if (!res.ok) {
        setResult({ error: data?.error || `Ошибка ${res.status}` });
      } else {
        setResult(data ?? { ok: true });
        setFile(null);
        setFileInputKey((key) => key + 1);
        void loadPlacements();
      }
    } catch {
      setResult({ error: "Нет связи с сервером" });
    } finally {
      setIsUploading(false);
    }
  };

  const removePlacement = async (placement: Placement) => {
    if (!window.confirm(`Убрать «${placement.trackTitle ?? "трек"}» из плейлиста «${placement.playlistName}»?`)) return;
    setBusyId(placement.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/playlists/${placement.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
      setPlacements((items) => items.filter((item) => item.id !== placement.id));
    } catch (error) {
      setRowError({ id: placement.id, message: error instanceof Error ? error.message : "Не удалось удалить." });
    } finally {
      setBusyId(null);
    }
  };

  const linkPlacement = async (placement: Placement) => {
    const release = window.prompt("Ссылка на релиз из админки (или его ID):");
    if (!release?.trim()) return;
    setBusyId(placement.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/playlists/${placement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release })
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
      await loadPlacements();
    } catch (error) {
      setRowError({ id: placement.id, message: error instanceof Error ? error.message : "Не удалось привязать." });
    } finally {
      setBusyId(null);
    }
  };

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return placements.filter((item) => {
      if (platformFilter && item.platform !== platformFilter) return false;
      if (onlyUnlinked && item.user) return false;
      if (!needle) return true;
      return [item.artistName, item.trackTitle, item.playlistName, item.user?.name, item.user?.email]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [placements, platformFilter, onlyUnlinked, query]);

  const unlinkedCount = placements.filter((item) => !item.user).length;

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Плейлисты</h1>
        <p className="mt-2 text-muted-foreground">
          Загрузите отчёт Звонко о попадании в редакторские плейлисты. Треки находятся по названию и нику артиста и
          появляются у артиста в кабинете.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Загрузить отчёт</CardTitle>
          <CardDescription>
            XLSX с колонками: Артист, Наименование трека, Позиция, Плейлист, Ссылка на плейлист. Колонка UPC не нужна.
            Повторная загрузка обновляет позиции.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Площадка</Label>
              <Select value={platform} onChange={(event) => setPlatform(event.target.value)} options={PLATFORM_OPTIONS} />
            </div>

            <div className="space-y-2">
              <Label>Файл XLSX</Label>
              <Input
                key={fileInputKey}
                type="file"
                accept=".xlsx, .xls"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                required
              />
            </div>

            <label className="flex items-start gap-3 text-sm text-white/75">
              <input
                type="checkbox"
                checked={removeMissing}
                onChange={(event) => setRemoveMissing(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Это полный отчёт: убрать треки этой площадки, которых нет в файле
                <span className="block text-white/45">Включайте, только если в файле все артисты, а не часть.</span>
              </span>
            </label>

            <Button type="submit" disabled={!file || isUploading} className="w-full">
              {isUploading ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-bounce" />
                  Загрузка...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Загрузить
                </>
              )}
            </Button>
          </form>

          {result?.ok ? (
            <div className="mt-6 flex gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Готово</p>
                <p className="mt-1">
                  Новых: {result.added ?? 0} · обновлено: {result.updated ?? 0}
                  {result.removed ? ` · убрано: ${result.removed}` : ""}
                  {result.skipped ? ` · пропущено строк: ${result.skipped}` : ""}
                </p>
                {result.unmatched?.length ? (
                  <div className="mt-2 text-amber-200">
                    <p>Не нашли релиз — привяжите вручную в списке ниже:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {result.unmatched.map((item, index) => (
                        <li key={index}>
                          {item.artistName || "—"} — {item.trackTitle || "—"} ({item.playlistName})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {result?.error ? (
            <div className="mt-6 flex gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-200">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Ошибка</p>
                <p className="mt-1">{result.error}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Кто в каких плейлистах</h2>
            <p className="mt-1 text-sm text-white/55">
              Всего: {placements.length}
              {unlinkedCount ? ` · без артиста: ${unlinkedCount}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Артист, трек, плейлист, почта"
              className="w-64"
            />
            <Select
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value)}
              options={[{ label: "Все площадки", value: "" }, ...PLATFORM_OPTIONS.slice(1)]}
            />
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={onlyUnlinked} onChange={(event) => setOnlyUnlinked(event.target.checked)} />
              Без артиста
            </label>
          </div>
        </div>

        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
          </p>
        ) : listError ? (
          <p className="text-sm text-red-300">{listError}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-white/55">
            {placements.length === 0 ? "Пока ничего не загружено." : "Ничего не найдено."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-white/[0.04] text-[12px] uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Артист и трек</th>
                  <th className="px-4 py-3 font-medium">Плейлист</th>
                  <th className="px-4 py-3 font-medium">Позиция</th>
                  <th className="px-4 py-3 font-medium">Кабинет</th>
                  <th className="px-4 py-3 font-medium">Обновлено</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className="border-t border-white/[0.06] align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{item.trackTitle || "—"}</p>
                      <p className="text-white/55">{item.artistName || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={item.playlistUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-white/90 hover:text-indigo-300"
                      >
                        {item.playlistName}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <p className="text-white/45">{PLATFORM_NAMES[item.platform] ?? item.platform}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-white/85">{item.position || "—"}</td>
                    <td className="px-4 py-3">
                      {item.user ? (
                        <>
                          <Link href={`/admin/users/${item.user.id}`} className="text-white/90 hover:text-indigo-300">
                            {item.user.name || "Без имени"}
                          </Link>
                          {item.release ? (
                            <Link
                              href={`/admin/releases/${item.release.id}`}
                              className="block text-white/45 hover:text-indigo-300"
                            >
                              {item.release.title}
                            </Link>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-amber-300">Не привязан</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/60">{formatDate(item.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void linkPlacement(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[12px] text-white/80 hover:bg-white/[0.06] disabled:opacity-40"
                          title="Привязать к релизу"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {item.user ? "Перепривязать" : "Привязать"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void removePlacement(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 px-2.5 py-1.5 text-[12px] text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Удалить
                        </button>
                      </div>
                      {rowError?.id === item.id ? (
                        <p className="mt-1 text-right text-[12px] text-rose-300">{rowError.message}</p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
