// @ts-nocheck
"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/releases/status-badge";
import { UserAvatar } from "@/components/user/user-avatar";
import type { AdminUserProfileDetails } from "@/lib/admin-user-service";
import type { UserFinanceView } from "@/lib/finance-service";
import type { UserReportItem } from "@/lib/report-service";
import type { UserSubscriptionView } from "@/lib/subscription-service";
import { formatRubCurrency } from "@/lib/currency-format";
import { formatAiTokenAmount } from "@/lib/ai-studio";
import { cn } from "@/lib/utils";

type FinanceReportStatusValue = "READY_TO_CONFIRM" | "AGREED";
type ReleaseStatusFilterValue = "moderating" | "approved" | "rejected";
type TransactionStatusValue = "COMPLETED" | "FAILED" | "PENDING" | "PROCESSING";
type TransactionTypeValue = "ROYALTY" | "PAYOUT" | "REFUND" | "FEE";

type UserReleasesPayload = {
  items: Array<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    moderationStartedAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
  }>;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

type AdminSubscriptionPlan = "standard" | "professional" | "premium" | "enterprise";
type AdminSubscriptionStatus = "active" | "canceled";
type EditableReportLine = UserReportItem["items"][number];

const SUBSCRIPTION_PLAN_OPTIONS: AdminSubscriptionPlan[] = [
  "standard",
  "professional",
  "premium",
  "enterprise"
];
const SUBSCRIPTION_STATUS_OPTIONS: AdminSubscriptionStatus[] = ["active", "canceled"];
const RELEASE_STATUS_OPTIONS: ReleaseStatusFilterValue[] = ["moderating", "approved", "rejected"];

function reportStatusLabel(status: FinanceReportStatusValue): string {
  return status === "AGREED" ? "Согласован" : "Ожидает согласования";
}

function reportLifecycleLabel(report: UserReportItem): string {
  if (report.lifecycleState === "agreed") return "Согласован";
  if (report.lifecycleState === "changes_requested") return "На доработке";
  return "Ожидает согласования";
}

function normalizeQuarterYear(dateValue: string): { quarter: number; year: number } {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  return {
    quarter: Math.floor(date.getUTCMonth() / 3) + 1,
    year: date.getUTCFullYear()
  };
}

function createEmptyReportLine(index: number): EditableReportLine {
  return {
    id: `line-${Date.now()}-${index}`,
    platformName: "",
    upc: "",
    releaseTitle: "",
    amount: 0
  };
}

function sumReportLines(items: EditableReportLine[]): number {
  return Number(items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0).toFixed(2));
}

function transactionTypeLabel(type: TransactionTypeValue): string {
  if (type === "ROYALTY") return "Начисление";
  if (type === "PAYOUT") return "Выплата";
  if (type === "REFUND") return "Возврат";
  return "Комиссия";
}

function transactionStatusLabel(status: TransactionStatusValue): string {
  if (status === "COMPLETED") return "Выполнено";
  if (status === "FAILED") return "Ошибка";
  return "В обработке";
}

export function AdminUserDetailClient({
  initialProfile,
  initialReleases,
  initialFinance,
  initialReports,
  initialSubscription
}: {
  initialProfile: AdminUserProfileDetails;
  initialReleases: UserReleasesPayload;
  initialFinance: UserFinanceView;
  initialReports: UserReportItem[];
  initialSubscription: UserSubscriptionView | null;
}) {
  const [profile, setProfile] = React.useState(initialProfile);
  const [releases, setReleases] = React.useState(initialReleases);
  const [finance, setFinance] = React.useState(initialFinance);
  const [reports, setReports] = React.useState(initialReports);
  const [subscriptionView, setSubscriptionView] = React.useState<UserSubscriptionView | null>(initialSubscription);

  const [busy, setBusy] = React.useState<null | "reload" | "topup" | "report" | "subscription">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [resendingReportId, setResendingReportId] = React.useState<string | null>(null);

  const [releaseStatusFilter, setReleaseStatusFilter] = React.useState<"" | ReleaseStatusFilterValue>("");

  const [topUpAmount, setTopUpAmount] = React.useState("1000");
  const [topUpComment, setTopUpComment] = React.useState("");
  const [balanceAdjustmentType, setBalanceAdjustmentType] = React.useState<"credit" | "debit">("credit");
  const [showTopUpConfirm, setShowTopUpConfirm] = React.useState(false);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const defaultQuarterYear = normalizeQuarterYear(monthStart);
  const [reportPeriodStart, setReportPeriodStart] = React.useState(monthStart);
  const [reportPeriodEnd, setReportPeriodEnd] = React.useState(monthEnd);
  const [reportAmount, setReportAmount] = React.useState("1000");
  const [reportStatus, setReportStatus] = React.useState<"READY_TO_CONFIRM" | "AGREED">("READY_TO_CONFIRM");
  const [reportComment, setReportComment] = React.useState("");
  const [reportQuarter, setReportQuarter] = React.useState<number>(defaultQuarterYear.quarter);
  const [reportYear, setReportYear] = React.useState<number>(defaultQuarterYear.year);
  const [reportItems, setReportItems] = React.useState<EditableReportLine[]>([]);
  const [editingReportId, setEditingReportId] = React.useState<string | null>(null);
  const [showReportConfirm, setShowReportConfirm] = React.useState(false);

  const [plan, setPlan] = React.useState<AdminSubscriptionPlan>(
    (initialSubscription?.plan as AdminSubscriptionPlan | undefined) ?? "standard"
  );
  const [subscriptionStatus, setSubscriptionStatus] = React.useState<AdminSubscriptionStatus>(
    (initialSubscription?.status as AdminSubscriptionStatus | undefined) ?? "canceled"
  );
  const [endsAt, setEndsAt] = React.useState(initialSubscription?.endsAt?.slice(0, 10) ?? "");
  const [subscriptionComment, setSubscriptionComment] = React.useState("");
  const reportAmountFromItems = sumReportLines(reportItems);
  const effectiveReportAmount = reportItems.length > 0 ? reportAmountFromItems : Number(reportAmount || 0);

  const reloadAll = React.useCallback(async () => {
    setBusy("reload");
    setError(null);
    try {
      const [profileRes, releasesRes, financeRes, reportsRes, subscriptionRes] = await Promise.all([
        fetch(`/api/admin/users/${profile.id}`, { method: "GET" }),
        fetch(`/api/admin/users/${profile.id}/releases?page=1&perPage=20`, { method: "GET" }),
        fetch(`/api/admin/users/${profile.id}/finance`, { method: "GET" }),
        fetch(`/api/admin/users/${profile.id}/reports`, { method: "GET" }),
        fetch(`/api/admin/users/${profile.id}/subscription`, { method: "GET" })
      ]);

      const profilePayload = (await profileRes.json().catch(() => null)) as
        | { error?: string; user?: AdminUserProfileDetails }
        | null;
      const releasesPayload = (await releasesRes.json().catch(() => null)) as
        | (UserReleasesPayload & { error?: never })
        | { error?: string }
        | null;
      const financePayload = (await financeRes.json().catch(() => null)) as
        | (UserFinanceView & { error?: never })
        | { error?: string }
        | null;
      const reportsPayload = (await reportsRes.json().catch(() => null)) as
        | { reports?: UserReportItem[]; error?: string }
        | null;
      const subscriptionPayload = (await subscriptionRes.json().catch(() => null)) as
        | { subscription?: UserSubscriptionView | null; error?: string }
        | null;

      if (!profileRes.ok || !profilePayload?.user) throw new Error(profilePayload?.error ?? "Не удалось загрузить пользователя.");
      if (!releasesRes.ok || !releasesPayload || !("items" in releasesPayload)) throw new Error("Не удалось загрузить релизы пользователя.");
      if (!financeRes.ok || !financePayload || !("transactions" in financePayload)) throw new Error("Не удалось загрузить финансы пользователя.");
      if (!reportsRes.ok || !reportsPayload?.reports) throw new Error("Не удалось загрузить отчеты пользователя.");
      if (!subscriptionRes.ok || !subscriptionPayload || !("subscription" in subscriptionPayload)) throw new Error("Не удалось загрузить подписку пользователя.");

      setProfile(profilePayload.user);
      setReleases(releasesPayload);
      setFinance(financePayload);
      setReports(reportsPayload.reports);
      const nextSub = subscriptionPayload.subscription;
      setSubscriptionView(nextSub ?? null);
      setPlan((nextSub?.plan as AdminSubscriptionPlan | undefined) ?? "standard");
      setSubscriptionStatus((nextSub?.status as AdminSubscriptionStatus | undefined) ?? "canceled");
      setEndsAt(nextSub?.endsAt?.slice(0, 10) ?? "");
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "Не удалось обновить данные.");
    } finally {
      setBusy(null);
    }
  }, [profile.id]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  function resetReportForm() {
    const nextQuarterYear = normalizeQuarterYear(monthStart);
    setEditingReportId(null);
    setReportPeriodStart(monthStart);
    setReportPeriodEnd(monthEnd);
    setReportAmount("1000");
    setReportStatus("READY_TO_CONFIRM");
    setReportComment("");
    setReportQuarter(nextQuarterYear.quarter);
    setReportYear(nextQuarterYear.year);
    setReportItems([]);
  }

  function loadReportIntoForm(report: UserReportItem) {
    setEditingReportId(report.id);
    setReportPeriodStart(report.periodStart.slice(0, 10));
    setReportPeriodEnd(report.periodEnd.slice(0, 10));
    setReportAmount(String(report.amount));
    setReportStatus(report.status);
    setReportComment(report.adminComment ?? "");
    setReportQuarter(report.quarter ?? normalizeQuarterYear(report.periodStart.slice(0, 10)).quarter);
    setReportYear(report.year ?? new Date(report.periodEnd).getUTCFullYear());
    setReportItems(
      report.items.length
        ? report.items.map((item, index) => ({
            ...item,
            id: item.id || `line-${index + 1}`
          }))
        : []
    );
  }

  function updateReportLine(index: number, patch: Partial<EditableReportLine>) {
    setReportItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  }

  async function reloadReleases(page = releases.page, status = releaseStatusFilter) {
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("perPage", String(releases.perPage));
      if (status) params.set("status", status);
      const response = await fetch(`/api/admin/users/${profile.id}/releases?${params.toString()}`, { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | (UserReleasesPayload & { error?: never })
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("items" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error : "Не удалось загрузить релизы.");
      }
      setReleases(payload);
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "Не удалось загрузить релизы.");
    }
  }

  async function confirmTopUp() {
    setBusy("topup");
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${profile.id}/balance/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: balanceAdjustmentType,
          amount: Number(topUpAmount),
          comment: topUpComment.trim()
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось изменить баланс.");
      }
      setShowTopUpConfirm(false);
      setTopUpComment("");
      setToast(payload?.message ?? "Баланс пользователя обновлен.");
      await reloadAll();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось изменить баланс.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmReportCreate() {
    setBusy("report");
    setError(null);
    try {
      const normalizedItems = reportItems
        .map((item) => ({
          id: item.id,
          platformName: item.platformName.trim(),
          upc: item.upc.trim(),
          releaseTitle: item.releaseTitle.trim(),
          amount: Number(item.amount)
        }))
        .filter((item) => item.platformName && item.releaseTitle && Number.isFinite(item.amount) && item.amount > 0);
      const requestBody = {
        periodStart: new Date(`${reportPeriodStart}T00:00:00.000Z`).toISOString(),
        periodEnd: new Date(`${reportPeriodEnd}T23:59:59.999Z`).toISOString(),
        amount: normalizedItems.length > 0 ? sumReportLines(normalizedItems) : Number(reportAmount),
        status: reportStatus,
        quarter: reportQuarter,
        year: reportYear,
        items: normalizedItems,
        comment: reportComment.trim() || undefined
      };
      const response = await fetch(
        editingReportId
          ? `/api/admin/users/${profile.id}/reports/${editingReportId}`
          : `/api/admin/users/${profile.id}/reports`,
        {
          method: editingReportId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        }
      );
      const responsePayload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(responsePayload?.error ?? "Не удалось добавить отчет.");
      }
      setShowReportConfirm(false);
      resetReportForm();
      setToast(
        responsePayload?.message ??
          (editingReportId ? "Отчет обновлен." : "Отчет отправлен пользователю.")
      );
      await reloadAll();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось добавить отчет.");
    } finally {
      setBusy(null);
    }
  }

  async function updateSubscription() {
    setBusy("subscription");
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${profile.id}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          status: subscriptionStatus,
          endsAt: endsAt ? new Date(`${endsAt}T00:00:00.000Z`).toISOString() : null,
          comment: subscriptionComment.trim() || undefined
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось обновить подписку.");
      }
      setSubscriptionComment("");
      setToast(payload?.message ?? "Подписка обновлена.");
      await reloadAll();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось обновить подписку.");
    } finally {
      setBusy(null);
    }
  }

  async function resendReport(reportId: string) {
    setResendingReportId(reportId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${profile.id}/reports/${reportId}/resend`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось отправить отчет повторно.");
      }
      setToast(payload?.message ?? "Отчет повторно отправлен пользователю.");
      await reloadAll();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось отправить отчет повторно."
      );
    } finally {
      setResendingReportId(null);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/85 hover:bg-white/[0.06]"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад к пользователям
        </Link>
        <button
          type="button"
          onClick={() => {
            void reloadAll();
          }}
          disabled={busy === "reload"}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 text-[13px] font-medium text-white/85 hover:bg-white/[0.06] disabled:opacity-50"
        >
          {busy === "reload" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Обновить
        </button>
      </div>

      <section className="rounded-2xl border border-white/[0.08] bg-[#15161d]/90 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <UserAvatar name={profile.name} avatarUrl={profile.avatarUrl} size="lg" className="h-20 w-20 text-[20px]" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[28px] font-semibold text-white">{profile.name}</h1>
            <p className="mt-1 text-[16px] text-white/75">{profile.email}</p>
            <div className="mt-2 grid gap-1 text-[14px] text-white/80 sm:grid-cols-2">
              <p>ID: {profile.id}</p>
              <p>Роль: {profile.role}</p>
              <p>Статус аккаунта: {profile.accountStatus}</p>
              <p>Дата регистрации: {new Date(profile.createdAt).toLocaleString("ru-RU")}</p>
              <p>Подписка: {profile.subscriptionPlan ?? "Нет"} {profile.subscriptionStatus ?? ""}</p>
              <p>Баланс: {formatRubCurrency(profile.balance)}</p>
              <p>AI-токены: {formatAiTokenAmount(profile.aiTokenBalance)}</p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/[0.08] bg-[#15161d]/90 p-5">
          <h2 className="text-[18px] font-semibold text-white">Баланс</h2>
          <p className="mt-1 text-[13px] text-white/60">Текущий баланс: {formatRubCurrency(finance.agreedBalance)}</p>
          <div className="mt-4 space-y-3">
            <select
              value={balanceAdjustmentType}
              onChange={(event) => setBalanceAdjustmentType(event.target.value as "credit" | "debit")}
              className="h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            >
              <option value="credit">Пополнить</option>
              <option value="debit">Списать</option>
            </select>
            <input
              type="number"
              min={1}
              value={topUpAmount}
              onChange={(event) => setTopUpAmount(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
              placeholder="Сумма пополнения, ₽"
            />
            <input
              value={topUpComment}
              onChange={(event) => setTopUpComment(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
              placeholder="Комментарий администратора"
            />
            <button
              type="button"
              onClick={() => setShowTopUpConfirm(true)}
              disabled={busy !== null}
              className="inline-flex h-11 items-center rounded-xl bg-[#7b3df5] px-4 text-[14px] font-semibold text-white hover:bg-[#8b4ff7] disabled:opacity-50"
            >
              Применить
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#15161d]/90 p-5">
          <h2 className="text-[18px] font-semibold text-white">Подписка</h2>
          <p className="mt-1 text-[13px] text-white/60">
            {subscriptionView
              ? `${subscriptionView.plan} ${subscriptionView.status} · До: ${subscriptionView.endsAt ? new Date(subscriptionView.endsAt).toLocaleDateString("ru-RU") : "—"} · Источник: ${subscriptionView.source === "ADMIN_GRANT" ? "Админ" : "Оплата"}`
              : "Нет активной подписки"}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select
              value={plan}
              onChange={(event) => setPlan(event.target.value as AdminSubscriptionPlan)}
              className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            >
              {SUBSCRIPTION_PLAN_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={subscriptionStatus}
              onChange={(event) => setSubscriptionStatus(event.target.value as AdminSubscriptionStatus)}
              className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            >
              {SUBSCRIPTION_STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            />
            <input
              value={subscriptionComment}
              onChange={(event) => setSubscriptionComment(event.target.value)}
              placeholder="Комментарий администратора"
              className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            />
            <button
              type="button"
              onClick={() => {
                void updateSubscription();
              }}
              disabled={busy !== null}
              className="inline-flex h-11 items-center rounded-xl bg-[#7b3df5] px-4 text-[14px] font-semibold text-white hover:bg-[#8b4ff7] disabled:opacity-50 sm:col-span-2"
            >
              Изменить подписку
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/[0.08] bg-[#15161d]/90 p-5">
        <h2 className="text-[18px] font-semibold text-white">Финансовые операции</h2>
        <div className="mt-3 space-y-2">
          {finance.transactions.length === 0 ? (
            <p className="text-[14px] text-white/60">Операций пока нет.</p>
          ) : (
            finance.transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2"
              >
                <p className="text-[13px] text-white/85">
                  {transactionTypeLabel(transaction.type)} · {formatRubCurrency(transaction.amount)} ·{" "}
                  {transactionStatusLabel(transaction.status)}
                </p>
                <p className="text-[12px] text-white/55">
                  {new Date(transaction.createdAt).toLocaleString("ru-RU")}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#15161d]/90 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-white">Отчеты</h2>
            <p className="mt-1 text-[13px] text-white/58">
              Создайте квартальный отчет, при необходимости скорректируйте строки по площадкам и релизам.
            </p>
          </div>
          {editingReportId ? (
            <button
              type="button"
              onClick={resetReportForm}
              className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-[13px] font-semibold text-white/80 hover:bg-white/[0.08]"
            >
              Сбросить редактирование
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            type="date"
            value={reportPeriodStart}
            onChange={(event) => {
              const value = event.target.value;
              setReportPeriodStart(value);
              const nextQuarterYear = normalizeQuarterYear(value);
              setReportQuarter(nextQuarterYear.quarter);
              setReportYear(nextQuarterYear.year);
            }}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          />
          <input
            type="date"
            value={reportPeriodEnd}
            onChange={(event) => setReportPeriodEnd(event.target.value)}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          />
          <select
            value={reportQuarter}
            onChange={(event) => setReportQuarter(Number(event.target.value))}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          >
            <option value={1}>1 квартал</option>
            <option value={2}>2 квартал</option>
            <option value={3}>3 квартал</option>
            <option value={4}>4 квартал</option>
          </select>
          <input
            type="number"
            min={2020}
            max={3000}
            value={reportYear}
            onChange={(event) => setReportYear(Number(event.target.value))}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            placeholder="Год"
          />
          <input
            type="number"
            min={0}
            value={reportAmount}
            onChange={(event) => setReportAmount(event.target.value)}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white/60 outline-none focus:border-[#7b3df5]/60"
            placeholder="Сумма, ₽"
            disabled={reportItems.length > 0}
          />
          <select
            value={reportStatus}
            onChange={(event) => setReportStatus(event.target.value as "READY_TO_CONFIRM" | "AGREED")}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          >
            <option value="READY_TO_CONFIRM">READY_TO_CONFIRM</option>
            <option value="AGREED">AGREED</option>
          </select>
          <input
            value={reportComment}
            onChange={(event) => setReportComment(event.target.value)}
            placeholder="Комментарий администратора"
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60 sm:col-span-2 lg:col-span-6"
          />
        </div>

        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-white">Детализация отчета</h3>
              <p className="mt-1 text-[13px] text-white/56">
                Пользователь увидит только свою сумму по строкам, без процента площадки.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold text-white/68">
                Итого: {formatRubCurrency(effectiveReportAmount)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setReportItems((current) => [...current, createEmptyReportLine(current.length + 1)])
                }
                className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-[13px] font-semibold text-white/80 hover:bg-white/[0.08]"
              >
                Добавить строку
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {reportItems.length === 0 ? (
              <p className="text-[14px] text-white/56">
                Можно оставить только общую сумму, либо добавить строки по площадкам, UPC и релизам.
              </p>
            ) : (
              reportItems.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-2xl border border-white/[0.08] bg-[#12131a] p-3 lg:grid-cols-[1.1fr,0.8fr,1.2fr,0.7fr,auto]"
                >
                  <input
                    value={item.platformName}
                    onChange={(event) => updateReportLine(index, { platformName: event.target.value })}
                    placeholder="Площадка"
                    className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
                  />
                  <input
                    value={item.upc}
                    onChange={(event) => updateReportLine(index, { upc: event.target.value })}
                    placeholder="UPC"
                    className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
                  />
                  <input
                    value={item.releaseTitle}
                    onChange={(event) => updateReportLine(index, { releaseTitle: event.target.value })}
                    placeholder="Релиз"
                    className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.amount}
                    onChange={(event) => updateReportLine(index, { amount: Number(event.target.value) })}
                    placeholder="Сумма"
                    className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReportItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 text-[13px] font-semibold text-rose-100 hover:border-rose-400/30"
                  >
                    Удалить
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowReportConfirm(true)}
              disabled={busy !== null}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#7b3df5] px-4 text-[14px] font-semibold text-white hover:bg-[#8b4ff7] disabled:opacity-50"
            >
              {editingReportId ? "Обновить отчет" : "Отправить отчет"}
            </button>
            {editingReportId ? (
              <button
                type="button"
                onClick={resetReportForm}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 text-[14px] font-semibold text-white/80 hover:bg-white/[0.08]"
              >
                Отменить редактирование
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {reports.length === 0 ? (
            <p className="text-[14px] text-white/60">Отчетов пока нет.</p>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-white">
                      {report.quarterLabel} · {formatRubCurrency(report.amount)}
                    </p>
                    <p className="mt-1 text-[13px] text-white/62">
                      {new Date(report.periodStart).toLocaleDateString("ru-RU")} —{" "}
                      {new Date(report.periodEnd).toLocaleDateString("ru-RU")}
                    </p>
                    <p className="mt-1 text-[12px] text-white/48">
                      Строк: {report.items.length} · Площадок: {report.platformTotals.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[12px]",
                        report.lifecycleState === "agreed"
                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                          : report.lifecycleState === "changes_requested"
                            ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
                            : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                      )}
                    >
                      {reportLifecycleLabel(report)}
                    </span>
                    {report.lifecycleState !== "agreed" ? (
                      <button
                        type="button"
                        onClick={() => loadReportIntoForm(report)}
                        className="rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-[12px] text-white/85 hover:bg-white/[0.08]"
                      >
                        Редактировать
                      </button>
                    ) : null}
                    {report.lifecycleState === "changes_requested" ? (
                      <button
                        type="button"
                        onClick={() => {
                          void resendReport(report.id);
                        }}
                        disabled={resendingReportId === report.id}
                        className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[12px] text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-50"
                      >
                        {resendingReportId === report.id ? "Отправка..." : "Отправить повторно"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {report.userComment ? (
                  <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-100">
                    Комментарий пользователя: {report.userComment}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#15161d]/90 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[18px] font-semibold text-white">Релизы пользователя</h2>
          <select
            value={releaseStatusFilter}
            onChange={(event) => {
              const value = event.target.value as "" | ReleaseStatusFilterValue;
              setReleaseStatusFilter(value);
              void reloadReleases(1, value);
            }}
            className="h-10 rounded-lg border border-white/[0.12] bg-black/25 px-3 text-[13px] text-white outline-none focus:border-[#7b3df5]/60"
          >
            <option value="">Все статусы</option>
            {RELEASE_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          {releases.items.length === 0 ? (
            <p className="text-[14px] text-white/60">Релизов пока нет.</p>
          ) : (
            releases.items.map((release) => (
              <div
                key={release.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2"
              >
                <div>
                  <p className="text-[15px] font-medium text-white">{release.title}</p>
                  <p className="text-[12px] text-white/55">
                    Создан: {new Date(release.createdAt).toLocaleString("ru-RU")} · Обновлен:{" "}
                    {new Date(release.updatedAt).toLocaleString("ru-RU")}
                  </p>
                  <p className="text-[12px] text-white/45">
                    Отправлен:{" "}
                    {release.moderationStartedAt
                      ? new Date(release.moderationStartedAt).toLocaleString("ru-RU")
                      : "—"}{" "}
                    · Принят:{" "}
                    {release.approvedAt ? new Date(release.approvedAt).toLocaleString("ru-RU") : "—"}{" "}
                    · Отклонён:{" "}
                    {release.rejectedAt ? new Date(release.rejectedAt).toLocaleString("ru-RU") : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={release.status.toLowerCase()} />
                  <Link
                    href={`/admin/releases/${release.id}`}
                    className="rounded-md border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-[12px] text-white/85 hover:bg-white/[0.08]"
                  >
                    Открыть
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {showTopUpConfirm ? (
        <ConfirmModal
          title="Подтвердите изменение баланса"
          description={`${balanceAdjustmentType === "credit" ? "Пополнить" : "Списать"} ${formatRubCurrency(Number(topUpAmount || 0))}?`}
          busy={busy === "topup"}
          onCancel={() => setShowTopUpConfirm(false)}
          onConfirm={() => {
            void confirmTopUp();
          }}
        />
      ) : null}

      {showReportConfirm ? (
        <ConfirmModal
          title={editingReportId ? "Подтвердите обновление отчета" : "Подтвердите отправку отчета"}
          description={`${editingReportId ? "Обновить" : "Отправить"} отчет на ${formatRubCurrency(effectiveReportAmount)}?`}
          busy={busy === "report"}
          onCancel={() => setShowReportConfirm(false)}
          onConfirm={() => {
            void confirmReportCreate();
          }}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-100">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  busy,
  onCancel,
  onConfirm
}: {
  title: string;
  description: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#14151d] p-5">
        <h3 className="text-[18px] font-semibold text-white">{title}</h3>
        <p className="mt-2 text-[13px] text-white/65">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/[0.12] px-3 py-2 text-[13px] text-white/80"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-[#7b3df5] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Сохраняем..." : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}
