"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  Coins,
  FileCheck,
  FileText,
  Hourglass,
  IdCard,
  Wallet,
  X
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell, PageSection } from "@/components/layout/dashboard-shell";
import { ReportDetailTable } from "@/components/finance/report-detail-table";
import { Button } from "@/components/ui/button";
import { formatRubCurrency } from "@/lib/currency-format";
import { cn } from "@/lib/utils";
import type { FinanceReportClientItem } from "@/lib/finance-client";
import type { FinanceReportStatus } from "@/lib/finance-policy";
import type { FinanceTransactionView } from "@/lib/finance-dashboard-server";
import type { PayoutWindowState } from "@/lib/payout-schedule";
import { computeAvailableToWithdraw } from "@/lib/payouts";
import type { PayoutRequestSummary } from "@/lib/payout-request";
import { PayoutRequestWizard } from "@/components/finance/payout-request-wizard";

const RevenueChart = dynamic(
  () => import("@/components/charts/revenue-chart").then((module) => module.RevenueChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] w-full animate-pulse rounded-xl border border-white/10 bg-white/[0.04]" />
    )
  }
);

const financeTabs = ["Отчеты", "Запрос выплаты", "Начисления"] as const;
type FinanceTab = (typeof financeTabs)[number];
const financeTabLabels: Record<FinanceTab, string> = {
  Отчеты: "Отчёты",
  "Запрос выплаты": "Выплаты",
  Начисления: "Начисления"
};
const transactionFilters = ["Все", "Начисления", "Списания", "Выплаты"] as const;
type TransactionFilter = (typeof transactionFilters)[number];

function reportStatusLabel(status: FinanceReportStatus): string {
  if (status === "agreed") return "Согласован";
  if (status === "changes_requested") return "На доработке";
  return "Ожидает согласования";
}

function getVisibleReportComment(comment: string | null): string | null {
  if (!comment) {
    return null;
  }

  const normalizedComment = comment.trim();
  if (!normalizedComment) {
    return null;
  }

  if (/^Импорт\s+.+$/i.test(normalizedComment)) {
    return null;
  }

  return normalizedComment;
}

export function FinancePageClient({
  initialReports,
  initialTransactions,
  initialAgreedBalance,
  initialPendingPayout,
  initialAccruals,
  initialAccrualSeries,
  minimumPayoutAmount,
  payoutWindow,
  initialPayoutRequests,
  contractNumber
}: {
  initialReports: FinanceReportClientItem[];
  initialTransactions: FinanceTransactionView[];
  initialAgreedBalance: number;
  initialPendingPayout: number;
  initialAccruals: number;
  initialAccrualSeries: Array<{ period: string; amount: number }>;
  minimumPayoutAmount: number;
  payoutWindow: PayoutWindowState;
  initialPayoutRequests: PayoutRequestSummary[];
  contractNumber: number | null;
}) {
  const [reports, setReports] = React.useState(initialReports);
  const [agreedBalance, setAgreedBalance] = React.useState(initialAgreedBalance);
  const [pendingPayout] = React.useState<number>(initialPendingPayout);
  const [accruals, setAccruals] = React.useState(initialAccruals);
  const [reportError, setError] = React.useState<string | null>(null);
  const [reportNotice, setReportNotice] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<FinanceTab>(
    initialReports.some((report) => report.status === "ready_to_confirm") ? "Отчеты" : "Запрос выплаты"
  );
  const [transactionFilter, setTransactionFilter] =
    React.useState<TransactionFilter>("Все");
  const [selectedReportId, setSelectedReportId] = React.useState<string | null>(null);
  const [reportComment, setReportComment] = React.useState("");
  const [reportActionBusy, setReportActionBusy] = React.useState<null | "agree" | "reject">(null);

  const pendingReportsCount = reports.filter(
    (report) => report.status === "ready_to_confirm"
  ).length;
  const changesRequestedCount = reports.filter(
    (report) => report.status === "changes_requested"
  ).length;
  const historyReportsCount = reports.filter((report) => report.status === "agreed").length;
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;

  const availableToWithdraw = computeAvailableToWithdraw({
    agreedBalance,
    pendingPayout
  });

  const minimumReached = availableToWithdraw >= minimumPayoutAmount;
  const minimumProgress =
    minimumPayoutAmount > 0 ? Math.min(100, Math.round((availableToWithdraw / minimumPayoutAmount) * 100)) : 100;
  const payoutWindowLabel = (payoutWindow.currentWindow ?? payoutWindow.nextWindow)?.label ?? null;
  const tabsRef = React.useRef<HTMLDivElement>(null);

  function openPayoutTab() {
    setActiveTab("Запрос выплаты");
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const filteredTransactions = initialTransactions.filter((transaction) => {
    if (transactionFilter === "Все") return true;
    if (transactionFilter === "Начисления") return transaction.type === "Royalty";
    if (transactionFilter === "Списания") return transaction.type === "Fee";
    if (transactionFilter === "Выплаты") return transaction.type === "Payout";
    return true;
  });

  async function submitReportDecision(decision: "agree" | "reject") {
    if (!selectedReport) {
      return;
    }

    setReportActionBusy(decision);
    setReportNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/finance/reports/agree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: selectedReport.id,
          decision,
          comment: reportComment.trim() || undefined
        })
      });

      const parsed = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; nextStatus?: FinanceReportStatus }
        | null;

      if (!response.ok) {
        throw new Error(parsed?.error ?? "Не удалось обновить статус отчета.");
      }

      setReports((current) =>
        current.map((report) =>
          report.id !== selectedReport.id
            ? report
            : {
                ...report,
                status: decision === "agree" ? "agreed" : "changes_requested",
                userComment: decision === "reject" ? reportComment.trim() || report.userComment : report.userComment
              }
        )
      );

      if (decision === "agree") {
        setAgreedBalance((current) => current + selectedReport.amount);
        setAccruals((current) => Math.max(0, Number((current - selectedReport.amount).toFixed(2))));
      }

      setReportNotice(
        parsed?.message ??
          (decision === "agree"
            ? "Отчет согласован, баланс обновлен."
            : "Отчет отправлен администратору на доработку.")
      );
      setError(null);
      setReportComment("");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Не удалось обновить статус отчета."
      );
    } finally {
      setReportActionBusy(null);
    }
  }

  return (
    <DashboardShell>
      <PageHeader
        title="Кошелёк"
        description="Доходы по согласованным отчётам, заявки на выплату и история начислений."
        actions={
          <button
            type="button"
            onClick={openPayoutTab}
            className="ux-button-primary inline-flex h-11 items-center gap-2 rounded-[18px] px-4 text-[15px] font-semibold text-white"
          >
            <ArrowUpRight className="h-4 w-4" />
            Вывести средства
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="relative overflow-hidden rounded-[26px] border border-[#7b61ff]/35 bg-[radial-gradient(circle_at_85%_0%,rgba(123,97,255,0.35),transparent_50%),linear-gradient(160deg,#1a1730,#111220_60%)] p-6 sm:p-7">
          <p className="flex items-center gap-2 text-[13px] font-medium text-[#c4b5fd]">
            <Wallet className="h-4 w-4" /> Доступно к выводу
          </p>
          <p className="mt-2 text-[40px] font-extrabold leading-none tracking-[-0.04em] text-white tabular-nums sm:text-[52px]">
            {formatRubCurrency(availableToWithdraw)}
          </p>
          <p className="mt-2 text-[13.5px] font-medium text-white/60">Без НДС, по согласованным отчётам</p>

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] font-semibold text-white/60">
              <span>Минимум для вывода — {formatRubCurrency(minimumPayoutAmount)}</span>
              {minimumReached ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> можно выводить
                </span>
              ) : (
                <span>ещё {formatRubCurrency(minimumPayoutAmount - availableToWithdraw)}</span>
              )}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#7b61ff,#a78bfa)]"
                style={{ width: `${minimumProgress}%` }}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={openPayoutTab}
              className="inline-flex h-11 items-center rounded-2xl bg-white px-5 text-[15px] font-semibold text-[#14121f] transition hover:bg-white/90"
            >
              {minimumReached ? `Вывести ${formatRubCurrency(availableToWithdraw)}` : "Запросить выплату"}
            </button>
            {payoutWindowLabel ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold",
                  payoutWindow.isOpen ? "bg-emerald-500/15 text-emerald-300" : "bg-[#7b61ff]/20 text-[#c4b5fd]"
                )}
              >
                <CalendarDays className="h-4 w-4" />
                {payoutWindow.isOpen ? "Окно выплат открыто" : "Окно выплат"}: {payoutWindowLabel}
              </span>
            ) : null}
          </div>
          <Wallet className="pointer-events-none absolute -bottom-8 right-6 h-44 w-44 text-[#a78bfa]/[0.07]" strokeWidth={1.2} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <SideMetric
            icon={<Hourglass className="h-5 w-5" />}
            label="Заявки на рассмотрении"
            value={formatRubCurrency(pendingPayout)}
            hint={pendingPayout > 0 ? "Ждут проверки менеджером" : "Активных заявок нет"}
            tone="amber"
          />
          <SideMetric
            icon={<FileText className="h-5 w-5" />}
            label="Ожидает согласования"
            value={formatRubCurrency(accruals)}
            hint={pendingReportsCount > 0 ? "Проверьте и согласуйте отчёт" : "Новые отчёты появятся здесь"}
            tone="violet"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <RuleChip icon={<FileCheck className="h-5 w-5" />}>
          Выплата только по <b className="text-white">согласованным</b> отчётам
        </RuleChip>
        <RuleChip icon={<Coins className="h-5 w-5" />}>
          Минимальная сумма — <b className="text-white">{formatRubCurrency(minimumPayoutAmount)}</b>
        </RuleChip>
        <RuleChip icon={<IdCard className="h-5 w-5" />}>Физлицо — расписка, самозанятый — чек «Мой налог»</RuleChip>
      </div>

      {pendingReportsCount > 0 ? (
        <button
          type="button"
          onClick={() => setActiveTab("Отчеты")}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-left text-[14px] font-medium text-amber-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
          Есть несогласованные отчёты — проверьте их, чтобы сумма попала в доступные средства.
        </button>
      ) : null}

      <div ref={tabsRef} className="flex flex-wrap items-center justify-between gap-3 scroll-mt-24">
        <div className="inline-flex gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-1">
          {financeTabs.map((tab) => {
            const count =
              tab === "Отчеты" ? reports.length : tab === "Запрос выплаты" ? initialPayoutRequests.length : 0;
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[14px] font-semibold transition-colors",
                  active ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
                )}
              >
                {financeTabLabels[tab]}
                {count > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] font-bold",
                      active ? "bg-[#7b61ff] text-white" : "bg-white/10 text-white/60"
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {activeTab === "Отчеты" ? (
      <PageSection className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold text-white">Отчеты</h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-5 text-white/52">
              Детализация отражает сведения, доступные по соответствующему отчетному периоду.
              Состав и последовательность полей могут отличаться в зависимости от содержания
              отчета; отсутствие отдельных полей не влияет на действительность отчета, сумму
              начисления или его статус.
            </p>
          </div>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-semibold text-white/64">
                  {reports.length} отчет{reports.length === 1 ? "" : reports.length < 5 ? "а" : "ов"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <ReportSummaryCard label="На согласовании" value={pendingReportsCount} tone="amber" />
                <ReportSummaryCard label="На доработке" value={changesRequestedCount} tone="rose" />
                <ReportSummaryCard label="История" value={historyReportsCount} tone="emerald" />
              </div>

              {reportNotice ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-[13px] font-medium text-emerald-100">
                  {reportNotice}
                </div>
              ) : null}

              {reportError ? (
                <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-[13px] font-medium text-rose-100">
                  {reportError}
                </div>
              ) : null}

              {reports.length ? (
                <div className="mt-4 grid gap-3">
                  {reports.map((report) => (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedReportId(report.id)}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-4 text-left transition-all",
                        selectedReportId === report.id
                          ? "border-[#7b3df5]/40 bg-[#7b3df5]/10 shadow-[0_18px_40px_-30px_rgba(123,61,245,0.75)]"
                          : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14]"
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[17px] font-semibold text-white">
                              {report.quarterLabel}
                            </span>
                            <span
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                                report.status === "agreed"
                                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                                  : report.status === "changes_requested"
                                    ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
                                    : "border-amber-400/25 bg-amber-500/10 text-amber-100"
                              )}
                            >
                              {reportStatusLabel(report.status)}
                            </span>
                          </div>
                          <p className="mt-3 text-[22px] font-semibold text-white">
                            {formatRubCurrency(report.amount)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/38">
                            Площадок
                          </p>
                          <p className="mt-1 text-[18px] font-semibold text-white">
                            {report.platformTotals.length}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-[14px] font-medium text-white/58">
                  Отчетов пока нет.
                </div>
              )}
            </PageSection>
          ) : null}

          {activeTab === "Запрос выплаты" ? (
            <div className="mt-4">
              <PayoutRequestWizard
                reports={reports}
                availableToWithdraw={availableToWithdraw}
                minimumPayoutAmount={minimumPayoutAmount}
                payoutWindow={payoutWindow}
                initialPayoutRequests={initialPayoutRequests}
                contractNumber={contractNumber}
              />
            </div>
          ) : null}

          {activeTab === "Начисления" ? (
            <PageSection className="mt-4">
              <h2 className="text-[20px] font-semibold text-white">Начисления</h2>
              <div className="mt-4">
                <RevenueChart data={initialAccrualSeries} />
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[18px] font-semibold text-white">История операций</h3>
                  <span className="text-[13px] font-semibold text-white/55">
                    Источник: ledger
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {transactionFilters.map((filter) => {
                    const active = transactionFilter === filter;
                    return (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setTransactionFilter(filter)}
                        className={cn(
                          "rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors",
                          active
                            ? "border-[#7b3df5]/40 bg-[#7b3df5]/18 text-white"
                            : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/20 hover:text-white"
                        )}
                      >
                        {filter}
                      </button>
                    );
                  })}
                </div>

                {filteredTransactions.length ? (
                  <div className="mt-4 grid gap-3">
                    {filteredTransactions.map((transaction) => {
                      const amountTone =
                        transaction.type === "Royalty"
                          ? "text-emerald-300"
                          : transaction.type === "Payout"
                            ? "text-amber-300"
                            : "text-white";
                      const amountPrefix =
                        transaction.type === "Royalty"
                          ? "+"
                          : transaction.type === "Payout" || transaction.type === "Fee"
                            ? "-"
                            : "";

                      return (
                        <div
                          key={transaction.id}
                          className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 shadow-[0_16px_44px_-28px_rgba(11,14,24,0.95)]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72">
                                  {transaction.type === "Royalty"
                                    ? "Начисление"
                                    : transaction.type === "Payout"
                                      ? "Выплата"
                                      : "Списание"}
                                </span>
                                <span className="text-[12px] font-semibold text-white/45">
                                  {transaction.date}
                                </span>
                              </div>
                              <p className="text-[14px] font-medium leading-6 text-white/78">
                                {transaction.description || "Операция без описания"}
                              </p>
                              {(transaction.releaseTitle ||
                                transaction.trackTitle ||
                                transaction.platformName) ? (
                                <div className="grid gap-1 pt-1 text-[12px] font-medium text-white/50 sm:grid-cols-3">
                                  <div className="min-w-0">
                                    <span className="uppercase tracking-[0.12em] text-white/36">
                                      Релиз
                                    </span>
                                    <p className="truncate pt-1 text-white/72">
                                      {transaction.releaseTitle ?? "—"}
                                    </p>
                                  </div>
                                  <div className="min-w-0">
                                    <span className="uppercase tracking-[0.12em] text-white/36">
                                      Трек
                                    </span>
                                    <p className="truncate pt-1 text-white/72">
                                      {transaction.trackTitle ?? "—"}
                                    </p>
                                  </div>
                                  <div className="min-w-0">
                                    <span className="uppercase tracking-[0.12em] text-white/36">
                                      Площадка
                                    </span>
                                    <p className="truncate pt-1 text-white/72">
                                      {transaction.platformName ?? "—"}
                                    </p>
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="shrink-0 text-right">
                              <p className={cn("text-[17px] font-semibold tabular-nums", amountTone)}>
                                {amountPrefix}
                                {formatRubCurrency(Math.abs(transaction.amount))}
                              </p>
                              <p className="mt-1 text-[12px] font-semibold text-white/45">
                                {transaction.status === "Completed"
                                  ? "Проведено"
                                  : transaction.status === "Pending"
                                    ? "В обработке"
                                    : "Ошибка"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-[14px] font-medium text-white/58">
                    По выбранному фильтру операций пока нет.
                  </div>
                )}
              </div>
            </PageSection>
          ) : null}

        </motion.div>
      </AnimatePresence>

      {selectedReport ? (
        <ReportDetailsModal
          report={selectedReport}
          comment={reportComment}
          onCommentChange={setReportComment}
          onClose={() => {
            setSelectedReportId(null);
            setReportComment("");
          }}
          onAgree={() => {
            void submitReportDecision("agree");
          }}
          onReject={() => {
            void submitReportDecision("reject");
          }}
          busy={reportActionBusy}
        />
      ) : null}
    </DashboardShell>
  );
}

function SideMetric({
  icon,
  label,
  value,
  hint,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "amber" | "violet";
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[24px] border border-white/[0.09] bg-[#13151d] p-5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-white/55">{label}</p>
        <p className="mt-2 text-[26px] font-bold tracking-[-0.02em] text-white tabular-nums">{value}</p>
        <p className="mt-1 text-[13px] font-medium text-white/45">{hint}</p>
      </div>
      <span
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-2xl",
          tone === "amber" ? "bg-amber-400/10 text-amber-300" : "bg-[#7b61ff]/15 text-[#c4b5fd]"
        )}
      >
        {icon}
      </span>
    </div>
  );
}

function RuleChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 text-[13.5px] font-medium text-white/60">
      <span className="shrink-0 text-[#a78bfa]">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function ReportSummaryCard({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "amber" | "rose" | "emerald";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      : tone === "rose"
        ? "border-rose-400/20 bg-rose-500/10 text-rose-100"
        : "border-amber-400/20 bg-amber-500/10 text-amber-100";

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", toneClass)}>
        {label}
      </span>
      <p className="mt-3 text-[28px] font-semibold text-white">{value}</p>
    </div>
  );
}

function ReportDetailsModal({
  report,
  comment,
  onCommentChange,
  onClose,
  onAgree,
  onReject,
  busy
}: {
  report: FinanceReportClientItem;
  comment: string;
  onCommentChange: (value: string) => void;
  onClose: () => void;
  onAgree: () => void;
  onReject: () => void;
  busy: null | "agree" | "reject";
}) {
  const visibleAdminComment = getVisibleReportComment(report.adminComment);
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[#05060b]/80 px-4 py-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-[min(1180px,calc(100vw-24px))] overflow-y-auto overflow-x-hidden rounded-[28px] border border-white/[0.09] bg-[#11131b] p-5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.95)] sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[24px] font-bold tracking-[-0.02em] text-white sm:text-[26px]">{report.quarterLabel}</h3>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                report.status === "agreed"
                  ? "bg-emerald-400/12 text-emerald-200"
                  : report.status === "changes_requested"
                    ? "bg-rose-400/12 text-rose-200"
                    : "bg-amber-400/12 text-amber-200"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  report.status === "agreed"
                    ? "bg-emerald-400"
                    : report.status === "changes_requested"
                      ? "bg-rose-400"
                      : "bg-amber-400"
                )}
              />
              {reportStatusLabel(report.status)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mt-5 overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#151824] p-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#7b61ff]/25 blur-3xl"
          />
          <p className="relative text-[13px] font-medium text-white/50">Сумма за квартал</p>
          <p className="relative mt-1 text-[36px] font-bold leading-tight tracking-[-0.02em] text-white tabular-nums">
            {formatRubCurrency(report.amount)}
          </p>
          <div className="relative mt-3 flex flex-wrap gap-2 text-[12px] font-medium text-white/60">
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1">Площадок: {report.platformTotals.length}</span>
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1">Строк в отчёте: {report.items.length}</span>
          </div>
          {visibleAdminComment ? (
            <p className="relative mt-4 border-t border-white/[0.07] pt-3 text-[14px] leading-6 text-white/70">
              {visibleAdminComment}
            </p>
          ) : null}
        </div>

        <div className="mt-5 grid min-w-0 gap-4">
          <div className="min-w-0 rounded-[22px] border border-white/[0.08] bg-[#151824] p-5">
            <h4 className="text-[16px] font-semibold text-white">По площадкам</h4>
            <div className="mt-3">
              {report.platformTotals.length ? (
                [...report.platformTotals]
                  .sort((a, b) => b.amount - a.amount)
                  .map((item) => {
                    const share = report.amount > 0 ? (item.amount / report.amount) * 100 : 0;
                    return (
                      <div
                        key={item.platformName}
                        className="flex items-center gap-3 border-t border-white/[0.06] py-3 first:border-t-0"
                      >
                        <span className="w-32 shrink-0 truncate text-[14px] font-semibold text-white sm:w-44">
                          {item.platformName}
                        </span>
                        <span className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07] sm:block">
                          <span
                            className="block h-full rounded-full bg-[#7b61ff]"
                            style={{ width: `${Math.max(2, Math.min(100, share))}%` }}
                          />
                        </span>
                        <span className="ml-auto w-28 shrink-0 text-right text-[14px] font-semibold tabular-nums text-white">
                          {formatRubCurrency(item.amount)}
                        </span>
                        <span className="w-12 shrink-0 text-right text-[12px] font-medium tabular-nums text-white/45">
                          {Math.round(share)}%
                        </span>
                      </div>
                    );
                  })
              ) : (
                <p className="text-[14px] text-white/58">Площадки не указаны.</p>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-[22px] border border-white/[0.08] bg-[#151824] p-5">
            <div className="flex items-center gap-2">
              <h4 className="text-[16px] font-semibold text-white">Детализация начислений</h4>
              {report.items.length ? (
                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[12px] font-semibold text-white/60">
                  {report.items.length}
                </span>
              ) : null}
            </div>
            {report.items.length ? (
              <ReportDetailTable items={report.items} />
            ) : (
              <p className="mt-3 text-[14px] text-white/58">Детализация по релизам не добавлена.</p>
            )}
          </div>
        </div>

        {report.userComment ? (
          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-100">
            Комментарий по доработке: {report.userComment}
          </div>
        ) : null}

        {report.status === "ready_to_confirm" ? (
          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <label className="block text-[13px] font-semibold text-white/70">
              Комментарий для администратора
              <textarea
                value={comment}
                onChange={(event) => onCommentChange(event.target.value)}
                placeholder="Если нужен пересчёт или исправление, коротко опишите причину."
                className="mt-2 min-h-[104px] w-full rounded-2xl border border-white/[0.12] bg-black/25 px-3.5 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-white/38 focus:border-[#7b3df5]/60"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={onAgree}
                disabled={busy !== null}
                className="btn-shine h-11 px-5 text-[14px]"
              >
                {busy === "agree" ? "Согласование..." : "Согласовать отчет"}
              </Button>
              <button
                type="button"
                onClick={onReject}
                disabled={busy !== null}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-500/10 px-5 text-[14px] font-semibold text-rose-100 transition-colors hover:border-rose-400/35 hover:bg-rose-500/14 disabled:opacity-50"
              >
                {busy === "reject" ? "Отправка..." : "Вернуть на доработку"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
