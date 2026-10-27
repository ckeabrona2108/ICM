"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Pencil, Search } from "lucide-react";

import { SmartLinkPlatformIcon } from "@/components/smart-link/platform-icon";

export interface SmartLinkTableItem {
  releaseId: string;
  title: string;
  artist: string;
  slug: string;
  publicUrl: string;
  coverUrl: string | null;
  livePlatformCodes: string[];
  views: number;
  clicks: number;
  dailyClicks: number[];
}

type Filter = "all" | "live" | "empty";

function pluralizePlatforms(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "площадка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "площадки";
  return "площадок";
}

function sparkPoints(values: number[]): string {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? 120 / (values.length - 1) : 0;
  return values.map((value, index) => `${(index * step).toFixed(1)},${(26 - (value / max) * 22).toFixed(1)}`).join(" ");
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      aria-label="Копировать ссылку"
      onClick={() => {
        void navigator.clipboard
          .writeText(url)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => null);
      }}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function SmartLinksTable({ items }: { items: SmartLinkTableItem[] }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const liveCount = items.filter((item) => item.livePlatformCodes.length > 0).length;
  const filters: Array<{ key: Filter; label: string; count: number; warn?: boolean }> = [
    { key: "all", label: "Все", count: items.length },
    { key: "live", label: "Опубликованы", count: liveCount },
    { key: "empty", label: "Нет ссылок", count: items.length - liveCount, warn: true }
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (filter === "live" && item.livePlatformCodes.length === 0) return false;
    if (filter === "empty" && item.livePlatformCodes.length > 0) return false;
    if (!normalizedQuery) return true;
    return [item.title, item.artist, item.slug].some((value) => value.toLowerCase().includes(normalizedQuery));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={`h-8 rounded-lg border px-3 text-[13px] transition ${
              filter === item.key
                ? "border-zinc-700 bg-zinc-900 text-white"
                : `border-transparent ${item.warn && item.count > 0 ? "text-amber-300" : "text-zinc-400"} hover:text-zinc-200`
            }`}
          >
            {item.label} · {item.count}
          </button>
        ))}
        <div className="flex-1" />
        <label className="flex h-9 w-full items-center gap-2 rounded-[10px] border border-zinc-800 bg-zinc-950 px-3 sm:w-64">
          <Search className="h-4 w-4 text-zinc-500" />
          <span className="sr-only">Поиск по релизам</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по релизам"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-zinc-800 bg-zinc-950/60">
        <table className="w-full min-w-[960px] table-fixed text-left">
          <colgroup>
            <col />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[100px]" />
            <col className="w-[100px]" />
            <col className="w-[72px]" />
            <col className="w-[100px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-800/80 text-xs text-zinc-500">
              <th className="px-4 py-2.5 font-normal">Релиз</th>
              <th className="px-3 py-2.5 font-normal">Статус</th>
              <th className="px-3 py-2.5 font-normal">Площадки</th>
              <th className="px-3 py-2.5 font-normal">Переходы, 14 дн</th>
              <th className="px-3 py-2.5 text-right font-normal">Просмотры</th>
              <th className="px-3 py-2.5 text-right font-normal">Переходы</th>
              <th className="px-3 py-2.5 text-right font-normal">CTR</th>
              <th className="px-4 py-2.5" aria-label="Действия" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {visible.map((item) => {
              const live = item.livePlatformCodes.length > 0;
              const ctr = item.views > 0 ? Math.round((item.clicks / item.views) * 100) : 0;
              const editHref = `/dashboard/releases/${encodeURIComponent(item.releaseId)}/smart-link`;
              return (
                <tr key={item.releaseId} className="transition hover:bg-zinc-900/40">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[9px] bg-zinc-800">
                        {item.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <Link href={editHref} className="block truncate text-sm font-medium text-zinc-100 hover:text-white">
                          {item.title} <span className="font-normal text-zinc-400">· {item.artist}</span>
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-zinc-500">
                          <span className="truncate">/l/{item.slug}</span>
                          <CopyButton url={item.publicUrl} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        live ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`} />
                      {live ? "Опубликовано" : "Нет ссылок"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center">
                      {item.livePlatformCodes.length === 0 ? (
                        <span className="text-xs text-zinc-500">—</span>
                      ) : (
                        <span
                          className="flex items-center gap-1"
                          title={`${item.livePlatformCodes.length} ${pluralizePlatforms(item.livePlatformCodes.length)} со ссылкой`}
                        >
                          {item.livePlatformCodes.slice(0, 4).map((code) => (
                            <SmartLinkPlatformIcon key={code} code={code} size={22} />
                          ))}
                          {item.livePlatformCodes.length > 4 ? (
                            <span className="grid h-[22px] min-w-[22px] place-items-center rounded-[6px] bg-zinc-800 px-1 text-[11px] font-medium text-zinc-300">
                              +{item.livePlatformCodes.length - 4}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <svg width="120" height="28" viewBox="0 0 120 28" aria-hidden="true">
                      <polyline
                        points={sparkPoints(item.dailyClicks)}
                        fill="none"
                        stroke={live ? "#a1a1aa" : "#52525b"}
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums">{item.views.toLocaleString("ru-RU")}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums">{item.clicks.toLocaleString("ru-RU")}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-zinc-400">{ctr}%</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <a
                        href={item.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Открыть страницу"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-800 text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <Link
                        href={editHref}
                        aria-label="Редактировать"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-800 text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-500">
                  Ничего не нашлось.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
