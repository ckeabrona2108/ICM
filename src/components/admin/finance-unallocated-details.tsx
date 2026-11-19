"use client";

import * as React from "react";

import type { UnallocatedImportSummary, UnallocatedTrackGroup } from "@/lib/finance-unallocated";

type Details = { totalAmount: number; totalRows: number; groups: UnallocatedTrackGroup[] };

const rub = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("ru-RU");
const PAGE = 100;

function matches(group: UnallocatedTrackGroup, query: string): boolean {
  if (!query) return true;
  return [group.title, group.artist, group.album, group.isrc, ...group.upcs, ...group.codes]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

/** "Что внутри": money still in the pool, one line per track, to see whose it is and why. Read-only. */
export function FinanceUnallocatedDetails({
  imports,
  importId,
  onImportChange,
  reloadKey
}: {
  imports: UnallocatedImportSummary[];
  importId: string;
  onImportChange: (importId: string) => void;
  /** Changes when the pool changed (after an accrual), to load the lines again. */
  reloadKey?: unknown;
}) {
  const [details, setDetails] = React.useState<Details | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [shown, setShown] = React.useState(PAGE);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setShown(PAGE);
    const params = importId ? `?importId=${encodeURIComponent(importId)}` : "";
    fetch(`/api/admin/catalog-sync/finance/unallocated/details${params}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { details?: Details; error?: string } | null;
        if (!response.ok || !payload?.details) throw new Error(payload?.error ?? "Не удалось показать нераспределённое");
        if (active) setDetails(payload.details);
      })
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [importId, reloadKey]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = React.useMemo(
    () => (details?.groups ?? []).filter((group) => matches(group, normalizedQuery)),
    [details, normalizedQuery]
  );
  const filteredAmount = filtered.reduce((sum, group) => sum + group.amount, 0);
  const exportHref = `/api/admin/catalog-sync/finance/unallocated/details.xlsx${importId ? `?importId=${encodeURIComponent(importId)}` : ""}`;

  return (
    <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShown(PAGE);
          }}
          placeholder="Трек, артист, UPC, ISRC или код"
          className="min-w-[220px] flex-1 rounded-full border border-white/10 bg-[#11131a] px-4 py-2 text-[13px] text-white outline-none placeholder:text-white/35"
        />
        <select
          value={importId}
          onChange={(event) => onImportChange(event.target.value)}
          className="max-w-[320px] rounded-full border border-white/10 bg-[#11131a] px-3 py-2 text-[13px] text-white/80 outline-none"
        >
          <option value="">Все импорты</option>
          {imports.map((item) => (
            <option key={item.importId} value={item.importId}>
              {item.fileName}
            </option>
          ))}
        </select>
        <a
          href={exportHref}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] text-white/70 hover:text-white"
        >
          Скачать Excel
        </a>
      </div>

      {error ? <p className="mt-3 text-[13px] text-rose-300">{error}</p> : null}
      {loading && !details ? <p className="mt-3 text-[13px] text-white/55">Собираем строки…</p> : null}

      {details ? (
        <>
          <p className="mt-3 text-[12.5px] text-white/55">
            {normalizedQuery
              ? `Найдено треков: ${filtered.length} на ${rub.format(filteredAmount)}.`
              : `Треков: ${details.groups.length}, строк: ${count.format(details.totalRows)}, сумма ${rub.format(details.totalAmount)}.`}{" "}
            Суммы до комиссии. Сначала треки, где больше всего денег.
            {loading ? " Обновляем…" : ""}
          </p>
          {filtered.length === 0 ? (
            <p className="mt-3 text-[13px] text-white/65">
              {details.groups.length === 0 ? "Нераспределённых денег нет." : "Ничего не найдено."}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06]">
              <table className="min-w-full text-left text-[12.5px] text-white/75">
                <thead className="bg-white/[0.03] text-white/45">
                  <tr>
                    <th className="px-3 py-2 font-medium">Трек</th>
                    <th className="px-3 py-2 font-medium">UPC / ISRC / код</th>
                    <th className="px-3 py-2 font-medium">Площадки</th>
                    <th className="px-3 py-2 font-medium">Импорт</th>
                    <th className="px-3 py-2 text-right font-medium">Строк</th>
                    <th className="px-3 py-2 text-right font-medium">Сумма</th>
                    <th className="px-3 py-2 font-medium">Почему не распределено</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, shown).map((group) => (
                    <tr key={group.key} className="border-t border-white/[0.05] align-top">
                      <td className="max-w-[260px] px-3 py-2">
                        <span className="block break-words font-semibold text-white">{group.title}</span>
                        <span className="block break-words text-white/55">
                          {[group.artist, group.album && group.album !== group.title ? group.album : ""].filter(Boolean).join(" · ") ||
                            "артист не указан"}
                        </span>
                      </td>
                      <td className="max-w-[200px] px-3 py-2 text-white/60">
                        {[...group.upcs.map((upc) => `UPC ${upc}`), group.isrc ? `ISRC ${group.isrc}` : "", ...group.codes.map((code) => `код ${code}`)]
                          .filter(Boolean)
                          .map((value) => (
                            <span key={value} className="block whitespace-nowrap">
                              {value}
                            </span>
                          ))}
                        {!group.upcs.length && !group.isrc && !group.codes.length ? "—" : null}
                      </td>
                      <td className="max-w-[180px] break-words px-3 py-2 text-white/60" title={group.platforms.join(", ")}>
                        {group.platforms.length === 0
                          ? "—"
                          : group.platforms.length > 4
                            ? `${group.platforms.slice(0, 4).join(", ")} и ещё ${group.platforms.length - 4}`
                            : group.platforms.join(", ")}
                      </td>
                      <td className="max-w-[220px] px-3 py-2 text-white/60">
                        {group.imports.map((item) => (
                          <span key={item.importId} className="block truncate" title={item.fileName}>
                            {item.quarterLabel} · {item.fileName}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{count.format(group.rows)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-white">{rub.format(group.amount)}</td>
                      <td className="max-w-[240px] break-words px-3 py-2 text-amber-200/85">{group.reasons.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((value) => value + PAGE)}
              className="mt-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] text-white/70 hover:text-white"
            >
              Показать ещё ({filtered.length - shown})
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
