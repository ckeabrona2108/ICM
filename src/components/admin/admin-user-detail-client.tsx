"use client";

import Link from "next/link";
import * as React from "react";
import {
  FinanceReportStatus,
  ReleaseStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  TransactionStatus,
  TransactionType
} from "@prisma/client";
import { ArrowLeft, Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/releases/status-badge";
import { UserAvatar } from "@/components/user/user-avatar";
import type { AdminUserProfileDetails } from "@/lib/admin-user-service";
import type { UserFinanceView } from "@/lib/finance-service";
import type { UserReportItem } from "@/lib/report-service";
import type { UserSubscriptionView } from "@/lib/subscription-service";
import { formatRubCurrency } from "@/lib/currency-format";
import { cn } from "@/lib/utils";

type UserReleasesPayload = {
  items: Array<{
    id: string;
    title: string;
    status: ReleaseStatus;
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

function reportStatusLabel(status: FinanceReportStatus): string {
  return status === FinanceReportStatus.AGREED ? "Согласован" : "Ожидает согласования";
}

function transactionTypeLabel(type: TransactionType): string {
  if (type === TransactionType.ROYALTY) return "Начисление";
  if (type === TransactionType.PAYOUT) return "Выплата";
  if (type === TransactionType.REFUND) return "Возврат";
  return "Комиссия";
}

function transactionStatusLabel(status: TransactionStatus): string {
  if (status === TransactionStatus.COMPLETED) return "Выполнено";
  if (status === TransactionStatus.FAILED) return "Ошибка";
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

  const [releaseStatusFilter, setReleaseStatusFilter] = React.useState<"" | ReleaseStatus>("");

  const [topUpAmount, setTopUpAmount] = React.useState("1000");
  const [topUpComment, setTopUpComment] = React.useState("");
  const [balanceAdjustmentType, setBalanceAdjustmentType] = React.useState<"credit" | "debit">("credit");
  const [showTopUpConfirm, setShowTopUpConfirm] = React.useState(false);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [reportPeriodStart, setReportPeriodStart] = React.useState(monthStart);
  const [reportPeriodEnd, setReportPeriodEnd] = React.useState(monthEnd);
  const [reportAmount, setReportAmount] = React.useState("1000");
  const [reportStatus, setReportStatus] = React.useState<"READY_TO_CONFIRM" | "AGREED">("READY_TO_CONFIRM");
  const [reportComment, setReportComment] = React.useState("");
  const [showReportConfirm, setShowReportConfirm] = React.useState(false);

  const [plan, setPlan] = React.useState<SubscriptionPlan>(
    initialSubscription?.plan ?? SubscriptionPlan.FREE
  );
  const [subscriptionStatus, setSubscriptionStatus] = React.useState<SubscriptionStatus>(
    initialSubscription?.status ?? SubscriptionStatus.CANCELED
  );
  const [endsAt, setEndsAt] = React.useState(initialSubscription?.endsAt?.slice(0, 10) ?? "");
  const [subscriptionComment, setSubscriptionComment] = React.useState("");

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
      setPlan(nextSub?.plan ?? SubscriptionPlan.FREE);
      setSubscriptionStatus(nextSub?.status ?? SubscriptionStatus.CANCELED);
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
      const response = await fetch(`/api/admin/users/${profile.id}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: new Date(`${reportPeriodStart}T00:00:00.000Z`).toISOString(),
          periodEnd: new Date(`${reportPeriodEnd}T23:59:59.999Z`).toISOString(),
          amount: Number(reportAmount),
          status: reportStatus,
          comment: reportComment.trim() || undefined
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось добавить отчет.");
      }
      setShowReportConfirm(false);
      setReportComment("");
      setToast(payload?.message ?? "Отчет добавлен.");
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
              onChange={(event) => setPlan(event.target.value as SubscriptionPlan)}
              className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            >
              {Object.values(SubscriptionPlan).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={subscriptionStatus}
              onChange={(event) => setSubscriptionStatus(event.target.value as SubscriptionStatus)}
              className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            >
              {Object.values(SubscriptionStatus).map((value) => (
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
        <h2 className="text-[18px] font-semibold text-white">Отчеты</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            type="date"
            value={reportPeriodStart}
            onChange={(event) => setReportPeriodStart(event.target.value)}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          />
          <input
            type="date"
            value={reportPeriodEnd}
            onChange={(event) => setReportPeriodEnd(event.target.value)}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          />
          <input
            type="number"
            min={1}
            value={reportAmount}
            onChange={(event) => setReportAmount(event.target.value)}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            placeholder="Сумма, ₽"
          />
          <select
            value={reportStatus}
            onChange={(event) => setReportStatus(event.target.value as "READY_TO_CONFIRM" | "AGREED")}
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          >
            <option value="READY_TO_CONFIRM">READY_TO_CONFIRM</option>
            <option value="AGREED">AGREED</option>
          </select>
          <button
            type="button"
            onClick={() => setShowReportConfirm(true)}
            disabled={busy !== null}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#7b3df5] px-4 text-[14px] font-semibold text-white hover:bg-[#8b4ff7] disabled:opacity-50"
          >
            Добавить отчет
          </button>
          <input
            value={reportComment}
            onChange={(event) => setReportComment(event.target.value)}
            placeholder="Комментарий администратора"
            className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60 sm:col-span-2 lg:col-span-5"
          />
        </div>

        <div className="mt-4 space-y-2">
          {reports.length === 0 ? (
            <p className="text-[14px] text-white/60">Отчетов пока нет.</p>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2"
              >
                <p className="text-[14px] text-white/85">
                  {new Date(report.periodStart).toLocaleDateString("ru-RU")} —{" "}
                  {new Date(report.periodEnd).toLocaleDateString("ru-RU")} · {formatRubCurrency(report.amount)}
                </p>
                <span
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[12px]",
                    report.status === FinanceReportStatus.AGREED
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                      : "border-amber-300/30 bg-amber-400/10 text-amber-200"
                  )}
                >
                  {reportStatusLabel(report.status)}
                </span>
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
              const value = event.target.value as "" | ReleaseStatus;
              setReleaseStatusFilter(value);
              void reloadReleases(1, value);
            }}
            className="h-10 rounded-lg border border-white/[0.12] bg-black/25 px-3 text-[13px] text-white outline-none focus:border-[#7b3df5]/60"
          >
            <option value="">Все статусы</option>
            {Object.values(ReleaseStatus).map((status) => (
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
          title="Подтвердите добавление отчета"
          description={`Добавить отчет на ${formatRubCurrency(Number(reportAmount || 0))}?`}
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
