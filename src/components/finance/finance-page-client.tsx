"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Coins, Percent, Send, Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell, PageSection } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  PayoutRequestBody,
  PayoutRequestFailureResponse,
  PayoutRequestSuccessResponse
} from "@/lib/api/contracts";
import type { FinanceReportClientItem } from "@/lib/finance-client";
import type { FinanceReportStatus } from "@/lib/finance-policy";
import { computeAvailableToWithdraw } from "@/lib/payouts";

const RevenueChart = dynamic(
  () => import("@/components/charts/revenue-chart").then((module) => module.RevenueChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] w-full animate-pulse rounded-xl border border-white/10 bg-white/[0.04]" />
    )
  }
);

const financeTabs = ["Запрос выплаты", "Начисления"] as const;
type FinanceTab = (typeof financeTabs)[number];

export function FinancePageClient({
  initialReports,
  initialAgreedBalance,
  initialPendingPayout,
  initialAccruals,
  initialAccrualSeries,
  minimumPayoutAmount
}: {
  initialReports: FinanceReportClientItem[];
  initialAgreedBalance: number;
  initialPendingPayout: number;
  initialAccruals: number;
  initialAccrualSeries: Array<{ period: string; amount: number }>;
  minimumPayoutAmount: number;
}) {
  type PayoutMethodUi = "bank_transfer" | "paypal_soon" | "usdt_soon" | "btc_soon";
  const fieldClass =
    "mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white outline-none transition-colors placeholder:text-white/45 focus:border-[#7b3df5]/60";

  const [amount, setAmount] = React.useState("");
  const [recipientName, setRecipientName] = React.useState("");
  const [payoutMethod, setPayoutMethod] =
    React.useState<PayoutMethodUi>("bank_transfer");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [paypalEmail, setPaypalEmail] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const reports = initialReports;
  const agreedBalance = initialAgreedBalance;
  const [pendingPayout, setPendingPayout] = React.useState<number>(initialPendingPayout);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<FinanceTab>("Запрос выплаты");

  const pendingReportsCount = reports.filter(
    (report) => report.status === "ready_to_confirm"
  ).length;

  const availableToWithdraw = computeAvailableToWithdraw({
    agreedBalance,
    pendingPayout
  });

  const canRequestPayout =
    availableToWithdraw >= minimumPayoutAmount && pendingReportsCount === 0;

  const reportStatuses: FinanceReportStatus[] = reports.map(
    (report) => report.status
  );

  async function requestPayout() {
    setError(null);
    setSuccess(null);

    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount)) {
      setError("Укажите корректную сумму выплаты.");
      return;
    }
    if (payoutMethod !== "bank_transfer") {
      setError("Этот способ получения пока недоступен.");
      return;
    }

    const payload: PayoutRequestBody = {
      amount: parsedAmount,
      availableBalance: availableToWithdraw,
      pendingReportsCount,
      minimumPayoutAmount,
      reportStatuses,
      requisites: {
        recipientName,
        payoutMethod: "bank_transfer",
        accountNumber,
        bankName,
        paypalEmail,
        taxId
      }
    };

    setSubmitting(true);

    try {
      const response = await fetch("/api/finance/payouts/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => null)) as
          | PayoutRequestFailureResponse
          | { error?: string }
          | null;

        if (parsed && "errors" in parsed && Array.isArray(parsed.errors)) {
          setError(parsed.errors.map((item) => item.message).join(" "));
        } else {
          const fallbackMessage =
            parsed && "error" in parsed ? parsed.error : undefined;
          setError(fallbackMessage ?? "Не удалось создать заявку на выплату.");
        }
        return;
      }

      const parsed = (await response.json()) as PayoutRequestSuccessResponse;
      setSuccess(parsed.message);
      setPendingPayout((prev) => prev + Math.abs(parsedAmount));
      setAmount("");
    } catch {
      setError("Сервис выплат временно недоступен. Повторите позже.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardShell>
      <PageHeader
        title="Кошелёк"
        description="Доступные средства без НДС по согласованным отчетам, статусы выплат и ограничения."
      />

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0, y: 10 },
          show: {
            opacity: 1,
            y: 0,
            transition: { staggerChildren: 0.06, delayChildren: 0.02 }
          }
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:auto-rows-fr"
      >
        <MetricCard
          icon={<Wallet className="h-4 w-4" />}
          label="Доступные средства"
          value={formatCurrency(availableToWithdraw, "RUB")}
          hint="Доступно к выводу"
        />
        <MetricCard
          icon={<Send className="h-4 w-4" />}
          label="Заявки на выплату"
          value={formatCurrency(pendingPayout, "RUB")}
          hint="На рассмотрении"
          tone="violet"
        />
        <MetricCard
          icon={<Coins className="h-4 w-4" />}
          label="Начисления"
          value={formatCurrency(initialAccruals, "RUB")}
          hint="Всего начислено"
          tone="cyan"
        />
      </motion.div>

      <PageSection className="mt-6">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#7b3df5]/35 bg-[#7b3df5]/15 text-[#c4b5fd] shadow-[0_0_0_1px_rgba(123,61,245,0.18),0_10px_30px_-18px_rgba(123,61,245,0.55)]">
            <Percent className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-white sm:text-[20px]">
              Ограничения перед выплатой
            </h2>
            <div className="mt-2 space-y-2 text-[15px] font-medium leading-relaxed text-white/75">
              <p>Выплата доступна только по согласованным отчетам.</p>
              <p>
                Минимальная сумма выплаты: RUB 2.000. Проверьте инструкцию менеджера по реквизитам
                и способу перечисления.
              </p>
              {pendingReportsCount > 0 ? (
                <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-amber-100/95">
                  Сейчас есть несогласованные отчеты: {pendingReportsCount}. Заявка на выплату
                  временно недоступна.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </PageSection>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Tabs tabs={[...financeTabs]} active={activeTab} onChange={(v) => setActiveTab(v as FinanceTab)} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {activeTab === "Запрос выплаты" ? (
            <PageSection className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[20px] font-semibold text-white">Запрос выплаты</h2>
                <span className="text-[13px] font-semibold text-white/55">
                  Доступно: {formatCurrency(availableToWithdraw, "RUB")}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-[13px] font-semibold text-white/70">
                    Сумма
                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="0.00"
                      className={fieldClass}
                    />
                  </label>

                  <label className="text-[13px] font-semibold text-white/70">
                    Получатель
                    <input
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                      placeholder="ФИО / компания"
                      className={fieldClass}
                    />
                  </label>

                  <label className="text-[13px] font-semibold text-white/70">
                    Способ получения
                    <select
                      value={payoutMethod}
                      onChange={(event) =>
                        setPayoutMethod(event.target.value as PayoutMethodUi)
                      }
                      className={fieldClass}
                    >
                      <option value="bank_transfer">Банковский перевод</option>
                      <option value="paypal_soon">PayPal (скоро)</option>
                      <option value="usdt_soon">USDT (скоро)</option>
                      <option value="btc_soon">BTC (скоро)</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-[13px] font-semibold text-white/70 md:col-span-2">
                    Реквизиты
                    <input
                      value={accountNumber}
                      onChange={(event) => setAccountNumber(event.target.value)}
                      placeholder="Номер счета / кошелька"
                      className={fieldClass}
                    />
                  </label>

                  {payoutMethod === "bank_transfer" ? (
                    <label className="text-[13px] font-semibold text-white/70">
                      Банк
                      <input
                        value={bankName}
                        onChange={(event) => setBankName(event.target.value)}
                        placeholder="Название банка"
                        className={fieldClass}
                      />
                    </label>
                  ) : null}
                </div>

                {payoutMethod === "bank_transfer" ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-[13px] font-semibold text-white/70 md:col-span-2">
                      ИНН / Налоговый ID
                      <input
                        value={taxId}
                        onChange={(event) => setTaxId(event.target.value)}
                        placeholder="Налоговый идентификатор"
                        className={fieldClass}
                      />
                    </label>
                  </div>
                ) : null}

                {payoutMethod !== "bank_transfer" ? (
                  <p className="text-[13px] font-semibold text-white/60">
                    Выбранный способ пока недоступен.
                  </p>
                ) : null}

                {error ? <p className="text-[13px] font-semibold text-rose-300">{error}</p> : null}
                {success ? (
                  <p className="text-[13px] font-semibold text-emerald-300">{success}</p>
                ) : null}

                <Button
                  type="button"
                  onClick={() => {
                    void requestPayout();
                  }}
                  disabled={!canRequestPayout || submitting}
                  className="btn-shine h-12 w-full px-6 text-[14px] leading-none md:w-auto"
                >
                  {submitting ? "Отправка..." : "Создать заявку на выплату"}
                </Button>
              </div>
            </PageSection>
          ) : null}

          {activeTab === "Начисления" ? (
            <PageSection className="mt-4">
              <h2 className="text-[20px] font-semibold text-white">Начисления</h2>
              <div className="mt-4">
                <RevenueChart data={initialAccrualSeries} />
              </div>
            </PageSection>
          ) : null}

        </motion.div>
      </AnimatePresence>
    </DashboardShell>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone = "violet"
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "violet" | "cyan" | "amber" | "slate";
}) {
  const ring =
    tone === "cyan"
      ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
        : tone === "slate"
          ? "border-white/15 bg-white/5 text-white/80"
          : "border-[#7b3df5]/25 bg-[#7b3df5]/15 text-[#c4b5fd]";

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 }
      }}
      className="group relative flex h-full min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#13151d]/85 p-4 shadow-[0_16px_44px_-28px_rgba(11,14,24,0.95)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] sm:p-5"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#7b3df5]/[0.10] blur-[24px] transition-opacity duration-300 group-hover:opacity-90" />
      <div className="grid min-w-0 flex-1 grid-cols-[auto,minmax(0,1fr)] items-start gap-x-3 gap-y-2.5">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl border", ring)}>
          {icon}
        </span>
        <p className="min-h-[2.75rem] min-w-0 text-[12px] font-semibold uppercase leading-[1.25] tracking-[0.12em] text-white/56 break-words [hyphens:auto] [overflow-wrap:anywhere]">
          {label}
        </p>
        <p className="col-span-2 min-w-0 text-[clamp(1.125rem,2.2vw,1.625rem)] font-semibold leading-[1.15] tracking-[-0.01em] text-white tabular-nums break-words [overflow-wrap:anywhere]">
          {value}
        </p>
        {hint ? (
          <p className="col-span-2 min-w-0 text-[13px] font-medium leading-[1.35] tracking-[0.01em] text-white/62 break-words [hyphens:auto] [overflow-wrap:anywhere]">
            {hint}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}
