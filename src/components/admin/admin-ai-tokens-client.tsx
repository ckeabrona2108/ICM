"use client";

import * as React from "react";
import { Clock3, Loader2, MinusCircle, PlusCircle, Search } from "lucide-react";

import { formatAiTokenAmount } from "@/lib/ai-studio";
import { formatRubCurrency } from "@/lib/currency-format";
import type { AdminUsersListResult } from "@/lib/admin-user-service";
import type { AiTokenTransactionResponse } from "@/lib/api/contracts";

type AdjustMode = "credit" | "debit";

export function AdminAiTokensClient({
  initialData,
  initialAiStudioStatus,
  initialPreparingOrdersCount
}: {
  initialData: AdminUsersListResult;
  initialAiStudioStatus: "preparing" | "active";
  initialPreparingOrdersCount: number;
}) {
  const [data, setData] = React.useState(initialData);
  const [aiStudioStatus, setAiStudioStatus] = React.useState(initialAiStudioStatus);
  const [preparingOrdersCount, setPreparingOrdersCount] = React.useState(initialPreparingOrdersCount);
  const [activationBusy, setActivationBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(20);

  const [selectedUser, setSelectedUser] = React.useState<AdminUsersListResult["items"][number] | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const [transactions, setTransactions] = React.useState<AiTokenTransactionResponse[]>([]);

  const [adjustMode, setAdjustMode] = React.useState<AdjustMode>("credit");
  const [adjustAmount, setAdjustAmount] = React.useState("1000");
  const [adjustReason, setAdjustReason] = React.useState("");
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [adjustBusy, setAdjustBusy] = React.useState(false);

  const load = React.useCallback(
    async (nextPage = page) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        params.set("sortBy", "createdAt");
        params.set("sortOrder", "desc");
        params.set("page", String(nextPage));
        params.set("perPage", String(perPage));

        const response = await fetch(`/api/admin/users?${params.toString()}`, { method: "GET" });
        const payload = (await response.json().catch(() => null)) as
          | (AdminUsersListResult & { error?: never })
          | { error?: string }
          | null;
        if (!response.ok || !payload || !("items" in payload)) {
          throw new Error(payload && "error" in payload ? payload.error : "Не удалось загрузить пользователей.");
        }
        setData(payload);
        setPage(payload.page);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить пользователей.");
      } finally {
        setLoading(false);
      }
    },
    [page, perPage, q]
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load, q, perPage]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function activateStudio() {
    setActivationBusy(true);
    setError(null);
    try {
      const nextStatus = aiStudioStatus === "active" ? "preparing" : "active";
      const response = await fetch("/api/admin/ai/studio/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            status?: "preparing" | "active";
            alreadyInStatus?: boolean;
            processedOrders?: number;
            affectedUsers?: number;
            error?: string;
          }
        | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? "Не удалось изменить статус AI Studio.");
      }

      const resolvedStatus = payload.status === "preparing" ? "preparing" : "active";
      setAiStudioStatus(resolvedStatus);
      if (resolvedStatus === "active") {
        setPreparingOrdersCount(0);
      }
      setToast(
        resolvedStatus === "active"
          ? payload.alreadyInStatus
            ? "AI Studio уже активирована"
            : `AI Studio активирована. Обработано заказов: ${payload.processedOrders ?? 0}.`
          : payload.alreadyInStatus
            ? "AI Studio уже в режиме подготовки"
            : "AI Studio переведена в режим подготовки"
      );
      await load(page);
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Не удалось изменить статус AI Studio.");
    } finally {
      setActivationBusy(false);
    }
  }

  async function openHistory(user: AdminUsersListResult["items"][number]) {
    setSelectedUser(user);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/admin/ai/tokens/${user.id}/transactions`, { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | { transactions?: AiTokenTransactionResponse[]; error?: string }
        | null;
      if (!response.ok || !payload?.transactions) {
        throw new Error(payload?.error ?? "Не удалось загрузить историю токенов.");
      }
      setTransactions(payload.transactions);
    } catch (historyLoadError) {
      setHistoryError(
        historyLoadError instanceof Error ? historyLoadError.message : "Не удалось загрузить историю токенов."
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function openAdjust(user: AdminUsersListResult["items"][number], mode: AdjustMode) {
    setSelectedUser(user);
    setAdjustMode(mode);
    setAdjustAmount("1000");
    setAdjustReason(mode === "credit" ? "Админское начисление токенов" : "Админское списание токенов");
    setAdjustOpen(true);
  }

  async function submitAdjust() {
    if (!selectedUser) return;
    setAdjustBusy(true);
    setError(null);
    try {
      const delta = Number(adjustAmount) * (adjustMode === "debit" ? -1 : 1);
      const reason = adjustReason.trim() || (adjustMode === "credit" ? "Админское начисление токенов" : "Админское списание токенов");
      const response = await fetch("/api/admin/ai/tokens/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: delta,
          reason
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; newBalance?: number; error?: string }
        | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? "Не удалось изменить баланс AI-токенов.");
      }

      const newBalance = payload.newBalance ?? 0;
      const updatedUser = { ...selectedUser, aiTokenBalance: newBalance };
      setData((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === selectedUser.id ? { ...item, aiTokenBalance: newBalance } : item
        )
      }));
      setSelectedUser(updatedUser);
      setToast(adjustMode === "credit" ? "AI-токены начислены" : "AI-токены списаны");
      setAdjustOpen(false);
      setAdjustReason("");
      if (historyOpen && selectedUser.id) {
        await openHistory(updatedUser);
      }
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "Не удалось изменить баланс AI-токенов.");
    } finally {
      setAdjustBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-white/[0.08] bg-[#15161d]/90 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="text-[12px] uppercase tracking-[0.12em] text-white/45">AI Studio</div>
            <div className="text-[20px] font-semibold text-white">
              {aiStudioStatus === "active" ? "AI Studio активна" : "AI Studio в подготовке"}
            </div>
            <div className="text-[13px] leading-6 text-white/62">
              {aiStudioStatus === "active"
                ? "Все новые покупки AI-токенов начисляются автоматически сразу после подтверждения оплаты."
                : `Ожидающих оплаченных заказов: ${preparingOrdersCount}. После активации все pending-токены будут начислены автоматически.`}
            </div>
          </div>
          {aiStudioStatus === "preparing" ? (
            <button
              type="button"
              onClick={() => void activateStudio()}
              disabled={activationBusy}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#7b3df5] px-5 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {activationBusy ? "Активируем..." : "Активировать AI Studio"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void activateStudio()}
              disabled={activationBusy}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10 px-5 text-[14px] font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {activationBusy ? "Переключаем..." : "Вернуть в preparing"}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Поиск по email / имени / id"
            className="h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 pl-10 pr-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          />
        </div>
        <select
          value={perPage}
          onChange={(event) => setPerPage(Number(event.target.value))}
          className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#15161d]/90">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="border-b border-white/[0.08] bg-black/20 text-[12px] uppercase tracking-[0.08em] text-white/55">
              <tr>
                <th className="px-3 py-3">Пользователь</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Тариф</th>
                <th className="px-3 py-3">AI-токены</th>
                <th className="px-3 py-3">Pending</th>
                <th className="px-3 py-3">Роялти</th>
                <th className="px-3 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[14px] text-white/60">
                    {loading ? "Загрузка..." : "Пользователи не найдены."}
                  </td>
                </tr>
              ) : (
                data.items.map((user) => (
                  <tr key={user.id} className="border-b border-white/[0.06] last:border-none">
                    <td className="px-3 py-3 text-[14px] font-semibold text-white">{user.name}</td>
                    <td className="px-3 py-3 text-[13px] text-white/68">{user.email}</td>
                    <td className="px-3 py-3 text-[13px] text-white/74">
                      {user.subscriptionPlan ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-white/86">
                      {formatAiTokenAmount(user.aiTokenBalance)}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-amber-200/90">
                      {formatAiTokenAmount(user.pendingAiTokenBalance)}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-white/86">
                      {formatRubCurrency(user.balance)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openAdjust(user, "credit")}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 hover:bg-white/[0.08]"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Добавить токены
                        </button>
                        <button
                          type="button"
                          onClick={() => openAdjust(user, "debit")}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 hover:bg-white/[0.08]"
                        >
                          <MinusCircle className="h-3.5 w-3.5" />
                          Списать токены
                        </button>
                        <button
                          type="button"
                          onClick={() => void openHistory(user)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 hover:bg-white/[0.08]"
                        >
                          <Clock3 className="h-3.5 w-3.5" />
                          История
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#15161d]/90 px-3 py-2">
        <p className="text-[13px] text-white/65">
          Всего: {data.total} · Стр. {data.page} / {data.totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load(Math.max(1, data.page - 1))}
            disabled={loading || data.page <= 1}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-[13px] text-white/85 hover:bg-white/[0.08] disabled:opacity-40"
          >
            Назад
          </button>
          <button
            type="button"
            onClick={() => void load(Math.min(data.totalPages, data.page + 1))}
            disabled={loading || data.page >= data.totalPages}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-[13px] text-white/85 hover:bg-white/[0.08] disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      </div>

      {adjustOpen && selectedUser ? (
        <TokenAdjustModal
          userName={selectedUser.name}
          mode={adjustMode}
          amount={adjustAmount}
          reason={adjustReason}
          busy={adjustBusy}
          onAmountChange={setAdjustAmount}
          onReasonChange={setAdjustReason}
          onCancel={() => setAdjustOpen(false)}
          onConfirm={() => {
            void submitAdjust();
          }}
        />
      ) : null}

      {historyOpen && selectedUser ? (
        <TokenHistoryModal
          userName={selectedUser.name}
          balance={selectedUser.aiTokenBalance}
          transactions={transactions}
          loading={historyLoading}
          error={historyError}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {toast ? <FloatingToast message={toast} /> : null}
    </div>
  );
}

function TokenAdjustModal({
  userName,
  mode,
  amount,
  reason,
  busy,
  onAmountChange,
  onReasonChange,
  onCancel,
  onConfirm
}: {
  userName: string;
  mode: AdjustMode;
  amount: string;
  reason: string;
  busy: boolean;
  onAmountChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[24px] border border-white/[0.10] bg-[#10131a] p-5 shadow-[0_30px_90px_-50px_rgba(0,0,0,0.95)]">
        <h3 className="text-[19px] font-semibold text-white">
          {mode === "credit" ? "Начислить токены" : "Списать токены"}
        </h3>
        <p className="mt-1 text-[13px] text-white/60">{userName}</p>
        <div className="mt-4 space-y-3">
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            placeholder="Количество токенов"
          />
          <input
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            placeholder="Причина"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-[14px] text-white/80 transition-colors hover:bg-white/[0.06]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-[#7b3df5] px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#8b4ff7] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "credit" ? "Начислить" : "Списать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TokenHistoryModal({
  userName,
  balance,
  transactions,
  loading,
  error,
  onClose
}: {
  userName: string;
  balance: number;
  transactions: AiTokenTransactionResponse[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto mt-16 w-full max-w-3xl rounded-[24px] border border-white/[0.10] bg-[#10131a] p-5 shadow-[0_30px_90px_-50px_rgba(0,0,0,0.95)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[19px] font-semibold text-white">История токенов</h3>
            <p className="mt-1 text-[13px] text-white/60">
              {userName} · Баланс {formatAiTokenAmount(balance)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] text-white/72"
          >
            Закрыть
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-100">
              {error}
            </div>
          ) : transactions.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white/60">
              История пока пуста.
            </div>
          ) : (
            transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
              >
                <div>
                  <div className="text-[14px] font-semibold text-white">
                    {transaction.description ?? transaction.type}
                  </div>
                  <div className="mt-1 text-[12px] text-white/55">
                    {transaction.type} · {transaction.packageCode ?? "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-semibold text-white">
                    {transaction.amountTokens > 0 ? "+" : transaction.amountTokens < 0 ? "-" : ""}
                    {formatAiTokenAmount(Math.abs(transaction.amountTokens))}
                  </div>
                  <div className="mt-1 text-[12px] text-white/55">
                    {new Date(transaction.createdAt).toLocaleString("ru-RU")}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function FloatingToast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-5 right-5 z-[70] rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[13px] font-medium text-emerald-50 shadow-[0_18px_36px_-24px_rgba(16,185,129,0.55)]">
      {message}
    </div>
  );
}
