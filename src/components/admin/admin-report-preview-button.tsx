"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Eye, Loader2 } from "lucide-react";

import { formatCurrency } from "@/lib/format";
import type { AdminFinanceReportItem } from "@/lib/report-service";
import { cn } from "@/lib/utils";

function statusLabel(status: AdminFinanceReportItem["lifecycleState"]): string {
  if (status === "agreed") return "Согласован";
  if (status === "changes_requested") return "На доработке";
  return "Ожидает согласования";
}

function formatLineDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ru-RU");
}

function formatQuantity(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ru-RU");
}

function formatOptionalCurrency(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return formatCurrency(value, "RUB");
}

function hasReportValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function PreviewModal({
  report,
  onClose
}: {
  report: AdminFinanceReportItem;
  onClose: () => void;
}) {
  const hasDetailedItems = report.items.some(
    (item) =>
      item.artistName ||
      item.usageType ||
      hasReportValue(item.quantity) ||
      hasReportValue(item.authorAmount) ||
      hasReportValue(item.relatedAmount) ||
      item.periodStart ||
      item.periodEnd
  );
  const showPeriodStartColumn = report.items.some((item) => item.periodStart);
  const showPeriodEndColumn = report.items.some((item) => item.periodEnd);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[#05060b]/80 px-4 py-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-[min(1180px,calc(100vw-24px))] overflow-y-auto overflow-x-hidden rounded-[28px] border border-white/10 bg-[#11131a] p-5 shadow-[0_30px_90px_-42px_rgba(0,0,0,0.95)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/38">
              Вид пользователя
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h3 className="text-[24px] font-semibold text-white">{report.quarterLabel}</h3>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                  report.lifecycleState === "agreed"
                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                    : report.lifecycleState === "changes_requested"
                      ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
                      : "border-amber-400/25 bg-amber-500/10 text-amber-100"
                )}
              >
                {statusLabel(report.lifecycleState)}
              </span>
            </div>
            <p className="mt-2 text-[13px] text-white/48">
              {report.user.name || report.user.email || "Пользователь"} · {report.user.email ?? "email не указан"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-semibold text-white/72 hover:border-white/20 hover:text-white"
          >
            Закрыть
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Сумма за квартал
          </p>
          <p className="mt-2 text-[30px] font-semibold text-white">
            {formatCurrency(report.amount, "RUB")}
          </p>
        </div>

        <div className={cn("mt-5 grid gap-4", hasDetailedItems ? "lg:grid-cols-1" : "lg:grid-cols-[0.95fr,1.05fr]")}>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h4 className="text-[15px] font-semibold text-white">По площадкам</h4>
            <div className="mt-3 space-y-2">
              {report.platformTotals.length ? (
                report.platformTotals.map((item) => (
                  <div
                    key={item.platformName}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2"
                  >
                    <span className="text-[14px] text-white/78">{item.platformName}</span>
                    <span className="text-[14px] font-semibold text-white">
                      {formatCurrency(item.amount, "RUB")}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[14px] text-white/58">Площадки не указаны.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h4 className="text-[15px] font-semibold text-white">
              {hasDetailedItems ? "Детализация начислений" : "Релизы и UPC"}
            </h4>
            {hasDetailedItems && report.items.length ? (
              <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/20">
                <table className="w-full min-w-[1120px] text-left text-[13px]">
                  <thead className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.12em] text-white/40">
                    <tr>
                      <th className="px-3 py-3 font-semibold">UPC</th>
                      <th className="px-3 py-3 font-semibold">Название</th>
                      <th className="px-3 py-3 font-semibold">Исполнитель</th>
                      <th className="px-3 py-3 font-semibold">Площадка</th>
                      <th className="px-3 py-3 font-semibold">Вид использования</th>
                      {showPeriodStartColumn ? <th className="px-3 py-3 font-semibold">Период начала</th> : null}
                      {showPeriodEndColumn ? <th className="px-3 py-3 font-semibold">Период окончания</th> : null}
                      <th className="px-3 py-3 text-right font-semibold">Кол-во</th>
                      <th className="px-3 py-3 text-right font-semibold">Авторские права</th>
                      <th className="px-3 py-3 text-right font-semibold">Смежные права</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {report.items.map((item) => (
                      <tr key={item.id} className="text-white/72">
                        <td className="px-3 py-3 text-white/54">{item.upc || "—"}</td>
                        <td className="max-w-[220px] px-3 py-3 font-semibold text-white">
                          <span className="block break-words">{item.releaseTitle}</span>
                        </td>
                        <td className="max-w-[180px] px-3 py-3">
                          <span className="block break-words">{item.artistName || "—"}</span>
                        </td>
                        <td className="max-w-[170px] px-3 py-3">
                          <span className="block break-words">{item.platformName || "Без площадки"}</span>
                        </td>
                        <td className="px-3 py-3">{item.usageType || "—"}</td>
                        {showPeriodStartColumn ? (
                          <td className="px-3 py-3 text-white/58">{formatLineDate(item.periodStart)}</td>
                        ) : null}
                        {showPeriodEndColumn ? (
                          <td className="px-3 py-3 text-white/58">{formatLineDate(item.periodEnd)}</td>
                        ) : null}
                        <td className="px-3 py-3 text-right">{formatQuantity(item.quantity)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-white/78">
                          {formatOptionalCurrency(item.authorAmount)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-white/78">
                          {formatOptionalCurrency(item.relatedAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {report.items.length ? (
                  report.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-white">{item.releaseTitle}</p>
                          <p className="mt-1 text-[12px] text-white/52">UPC: {item.upc || "—"}</p>
                        </div>
                        <span className="text-[14px] font-semibold text-white">
                          {formatCurrency(item.amount, "RUB")}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[14px] text-white/58">Детализация по релизам не добавлена.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {report.userComment ? (
          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-100">
            Комментарий по доработке: {report.userComment}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

type AdminReportSummary = Pick<AdminFinanceReportItem, "id" | "amount" | "quarterLabel" | "lifecycleState" | "user">;

export function AdminReportPreviewButton({ report }: { report: AdminReportSummary }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fullReport, setFullReport] = React.useState<AdminFinanceReportItem | null>(null);

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(report.user.id)}/reports/${encodeURIComponent(report.id)}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as { report?: AdminFinanceReportItem; error?: string } | null;
      if (!response.ok || !payload?.report) {
        throw new Error(payload?.error || "Не удалось загрузить отчёт.");
      }
      setFullReport({ ...payload.report, user: report.user });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить отчёт.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPreview()}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.08]"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
        {loading ? "Загрузка..." : "Посмотреть"}
      </button>
      {open && loading ? (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[#05060b]/80 px-4 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-[#11131a] px-5 py-4 text-[14px] text-white/72 shadow-2xl">
            Загружаем детализацию отчёта...
          </div>
        </div>
      ) : null}
      {open && !loading && error ? (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[#05060b]/80 px-4 backdrop-blur-sm">
          <div className="max-w-md rounded-2xl border border-rose-400/20 bg-[#11131a] px-5 py-4 shadow-2xl">
            <p className="text-[14px] text-rose-100">{error}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 rounded-xl border border-white/10 px-3 py-2 text-[13px] font-semibold text-white/75 hover:text-white"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
      {open && !loading && !error && fullReport ? (
        <PreviewModal report={fullReport} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
