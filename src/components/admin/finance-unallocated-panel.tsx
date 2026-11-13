"use client";

import * as React from "react";

import { FINANCE_RULE_LABELS } from "@/lib/finance-import-overview";
import type { SupplementCandidate, UnallocatedImportSummary } from "@/lib/finance-unallocated";

type Overview = { totalAmount: number; totalRows: number; imports: UnallocatedImportSummary[] };
type ScanStats = {
  scannedRows: number;
  notFound: number;
  notApproved: number;
  conflicts: number;
  candidates: number;
  amount: number;
};

const rub = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });

function currentQuarterYear() {
  const now = new Date();
  return { quarter: Math.floor(now.getMonth() / 3) + 1, year: now.getFullYear() };
}

function quarterLabel(quarter: number | null, year: number | null) {
  return quarter && year ? `${quarter} кв ${year}` : "квартал не указан";
}

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

/** Money from applied finance imports that matched nobody, and late accruals once the release appears. */
export function FinanceUnallocatedPanel({ onApplied }: { onApplied?: () => void }) {
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [candidates, setCandidates] = React.useState<SupplementCandidate[] | null>(null);
  const [stats, setStats] = React.useState<ScanStats | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [applyingKey, setApplyingKey] = React.useState<string | null>(null);
  const [periods, setPeriods] = React.useState<Record<string, { quarter: number; year: number }>>({});
  const [showImports, setShowImports] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const loadOverview = React.useCallback(async () => {
    const response = await fetch("/api/admin/catalog-sync/finance/unallocated", { cache: "no-store" });
    const payload = await readJson<{ overview?: Overview; error?: string }>(response);
    if (!response.ok || !payload?.overview) throw new Error(payload?.error ?? "Не удалось посчитать нераспределённое");
    setOverview(payload.overview);
  }, []);

  React.useEffect(() => {
    void loadOverview().catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, [loadOverview]);

  async function scan() {
    setScanning(true);
    setError(null);
    setDone(null);
    try {
      const response = await fetch("/api/admin/catalog-sync/finance/unallocated/scan", { method: "POST" });
      const payload = await readJson<{ candidates?: SupplementCandidate[]; stats?: ScanStats; error?: string }>(response);
      if (!response.ok || !payload?.candidates) throw new Error(payload?.error ?? "Не удалось проверить нераспределённое");
      setCandidates(payload.candidates);
      setStats(payload.stats ?? null);
      const fallback = currentQuarterYear();
      setPeriods(
        Object.fromEntries(
          payload.candidates.map((candidate) => [
            candidate.key,
            candidate.quarter && candidate.year && !candidate.payoutDoneForQuarter
              ? { quarter: candidate.quarter, year: candidate.year }
              : fallback
          ])
        )
      );
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setScanning(false);
    }
  }

  async function apply(candidate: SupplementCandidate) {
    const period = periods[candidate.key] ?? currentQuarterYear();
    const warnings = [
      candidate.needsCheck ? "часть строк сопоставлена только по названию и артисту" : null,
      candidate.firstAccrual ? "артист получает начисления впервые" : null
    ].filter(Boolean);
    const confirmed = window.confirm(
      `Начислить ${candidate.userLabel} ${rub.format(candidate.amount)} (до комиссии) отдельным отчётом за ${period.quarter} кв ${period.year}?` +
        (warnings.length ? `\n\nПроверьте: ${warnings.join("; ")}.` : "")
    );
    if (!confirmed) return;

    setApplyingKey(candidate.key);
    setError(null);
    setDone(null);
    try {
      const response = await fetch("/api/admin/catalog-sync/finance/unallocated/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceImportId: candidate.sourceImportId,
          userId: candidate.userId,
          reportQuarter: period.quarter,
          reportYear: period.year
        })
      });
      const payload = await readJson<{ item?: { net_amount_total?: string | number }; error?: string }>(response);
      if (!response.ok || !payload?.item) throw new Error(payload?.error ?? "Не удалось начислить");
      setDone(
        `${candidate.userLabel}: доначислено ${rub.format(Number(payload.item.net_amount_total ?? 0))} отчётом за ${period.quarter} кв ${period.year}. Импорт-доначисление появился в истории — его можно откатить.`
      );
      setCandidates((current) => current?.filter((item) => item.key !== candidate.key) ?? null);
      await loadOverview().catch(() => undefined);
      onApplied?.();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setApplyingKey(null);
    }
  }

  const supplementedTotal = overview?.imports.reduce((sum, item) => sum + item.supplementedAmount, 0) ?? 0;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/45">Нераспределено всего</p>
          <p className="mt-1 text-[26px] font-semibold text-white">{overview ? rub.format(overview.totalAmount) : "…"}</p>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-white/55">
            Деньги из применённых отчётов, которые не нашли артиста.
            {overview && overview.imports.length
              ? ` ${overview.totalRows} строк в ${overview.imports.length} импортах.`
              : ""}
            {supplementedTotal > 0 ? ` Уже доначислено позже: ${rub.format(supplementedTotal)}.` : ""} Кнопка ищет их
            заново по UPC, ISRC и коду партнёра среди релизов, прошедших модерацию. Деньги начисляются только после вашего
            подтверждения, отдельным отчётом-доначислением.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {overview && overview.imports.length ? (
            <button
              type="button"
              onClick={() => setShowImports((value) => !value)}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] text-white/70 hover:text-white"
            >
              {showImports ? "Скрыть по импортам" : "По импортам"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={scanning || !overview || overview.totalRows === 0}
            onClick={() => {
              void scan();
            }}
            className="rounded-full bg-[#7b3df5] px-5 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scanning ? "Проверяем…" : "Проверить нераспределённое"}
          </button>
        </div>
      </div>

      {showImports && overview ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="min-w-full text-left text-[12.5px] text-white/75">
            <thead className="bg-white/[0.03] text-white/45">
              <tr>
                <th className="px-3 py-2 font-medium">Импорт</th>
                <th className="px-3 py-2 font-medium">Квартал</th>
                <th className="px-3 py-2 font-medium">Было нераспределено</th>
                <th className="px-3 py-2 font-medium">Доначислено позже</th>
                <th className="px-3 py-2 font-medium">Осталось</th>
              </tr>
            </thead>
            <tbody>
              {overview.imports.map((item) => (
                <tr key={item.importId} className="border-t border-white/[0.05]">
                  <td className="max-w-[320px] truncate px-3 py-2" title={item.fileName}>{item.fileName}</td>
                  <td className="px-3 py-2">{quarterLabel(item.quarter, item.year)}</td>
                  <td className="px-3 py-2">{rub.format(item.unallocatedAmount)}</td>
                  <td className="px-3 py-2">{item.supplementedAmount ? rub.format(item.supplementedAmount) : "—"}</td>
                  <td className="px-3 py-2 font-semibold text-white">{rub.format(item.remainingAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {stats ? (
        <p className="mt-4 text-[12.5px] text-white/55">
          Проверено строк: {stats.scannedRows}. Нашлось: {stats.candidates} кандидатов на {rub.format(stats.amount)}.
          {stats.notApproved ? ` Релиз найден, но ещё не прошёл модерацию: ${stats.notApproved}.` : ""}
          {stats.conflicts ? ` UPC у нескольких артистов (пропущено): ${stats.conflicts}.` : ""}
          {` Не найдено: ${stats.notFound}.`}
        </p>
      ) : null}

      {candidates && candidates.length === 0 ? (
        <p className="mt-3 text-[13px] text-white/65">Новых совпадений нет: релизы для нераспределённых денег пока не появились.</p>
      ) : null}

      {candidates && candidates.length > 0 ? (
        <div className="mt-3 space-y-3">
          {candidates.map((candidate) => {
            const period = periods[candidate.key] ?? currentQuarterYear();
            return (
              <div key={candidate.key} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-white">
                      {candidate.userLabel} · {quarterLabel(candidate.quarter, candidate.year)} ·{" "}
                      {rub.format(candidate.amount)} <span className="text-[12px] font-normal text-white/45">до комиссии</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-white/45" title={candidate.sourceFileName}>
                      {candidate.rowIds.length} строк из «{candidate.sourceFileName}» ·{" "}
                      {candidate.rules.map((rule) => FINANCE_RULE_LABELS[rule] ?? rule).join(", ")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
                      {candidate.needsCheck ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">
                          По названию и артисту — проверьте
                        </span>
                      ) : null}
                      {candidate.firstAccrual ? (
                        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-200">Первое начисление у артиста</span>
                      ) : null}
                      {candidate.releaseAddedAfterImport ? (
                        <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-white/70">Релиз добавлен после импорта</span>
                      ) : null}
                      {candidate.payoutDoneForQuarter ? (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-200">
                          За {quarterLabel(candidate.quarter, candidate.year)} уже есть выплата — начислите в текущий квартал
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={period.quarter}
                      onChange={(event) =>
                        setPeriods((current) => ({ ...current, [candidate.key]: { ...period, quarter: Number(event.target.value) } }))
                      }
                      className="rounded-lg border border-white/10 bg-[#0f1016] px-2 py-1.5 text-[13px] text-white"
                    >
                      {[1, 2, 3, 4].map((quarter) => (
                        <option key={quarter} value={quarter}>
                          {quarter} кв
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={period.year}
                      onChange={(event) =>
                        setPeriods((current) => ({ ...current, [candidate.key]: { ...period, year: Number(event.target.value) } }))
                      }
                      className="w-[84px] rounded-lg border border-white/10 bg-[#0f1016] px-2 py-1.5 text-[13px] text-white"
                    />
                    <button
                      type="button"
                      disabled={applyingKey !== null}
                      onClick={() => {
                        void apply(candidate);
                      }}
                      className="rounded-full bg-emerald-500/90 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      {applyingKey === candidate.key ? "Начисляем…" : "Начислить"}
                    </button>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-[12.5px] text-white/70">
                  {candidate.releases.map((release) => (
                    <li key={release.id} className="flex justify-between gap-3">
                      <span className="truncate">
                        {release.title}
                        {release.upc ? <span className="text-white/40"> · UPC {release.upc}</span> : null}
                      </span>
                      <span className="shrink-0">{rub.format(release.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-[13px] text-rose-300">{error}</p> : null}
      {done ? <p className="mt-3 text-[13px] text-emerald-300">{done}</p> : null}
    </section>
  );
}
