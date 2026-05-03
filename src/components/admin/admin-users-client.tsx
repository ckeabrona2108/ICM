"use client";

import Link from "next/link";
import * as React from "react";
import { SubscriptionPlan } from "@prisma/client";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { UserAvatar } from "@/components/user/user-avatar";
import type { AdminUsersListResult } from "@/lib/admin-user-service";
import { formatRubCurrency } from "@/lib/currency-format";

export function AdminUsersClient({ initialData }: { initialData: AdminUsersListResult }) {
  const [data, setData] = React.useState(initialData);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [q, setQ] = React.useState("");
  const [subscription, setSubscription] = React.useState<"" | SubscriptionPlan>("");
  const [status, setStatus] = React.useState<"" | "ACTIVE" | "INACTIVE">("");
  const [sortBy, setSortBy] = React.useState<"createdAt" | "balance" | "releaseCount">("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [perPage, setPerPage] = React.useState(20);

  const load = React.useCallback(
    async (page: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (subscription) params.set("subscription", subscription);
        if (status) params.set("status", status);
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);
        params.set("page", String(page));
        params.set("perPage", String(perPage));

        const response = await fetch(`/api/admin/users?${params.toString()}`, { method: "GET" });
        const payload = (await response.json().catch(() => null)) as
          | (AdminUsersListResult & { error?: never })
          | { error?: string }
          | null;
        if (!response.ok || !payload || !("items" in payload)) {
          throw new Error(
            payload && "error" in payload && payload.error
              ? payload.error
              : "Не удалось загрузить пользователей."
          );
        }
        setData(payload);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Не удалось загрузить пользователей."
        );
      } finally {
        setLoading(false);
      }
    },
    [q, subscription, status, sortBy, sortOrder, perPage]
  );

  React.useEffect(() => {
    const timer = setTimeout(() => {
      void load(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, subscription, status, sortBy, sortOrder, perPage, load]);

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Поиск по имени/email/id"
            className="h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 pl-10 pr-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          />
        </div>
        <select
          value={subscription}
          onChange={(event) => setSubscription(event.target.value as "" | SubscriptionPlan)}
          className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
        >
          <option value="">Подписка: все</option>
          {Object.values(SubscriptionPlan).map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as "" | "ACTIVE" | "INACTIVE")}
          className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
        >
          <option value="">Статус: все</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
        </select>
        <select
          value={sortBy}
          onChange={(event) =>
            setSortBy(event.target.value as "createdAt" | "balance" | "releaseCount")
          }
          className="h-11 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
        >
          <option value="createdAt">Сортировка: дата регистрации</option>
          <option value="balance">Сортировка: баланс</option>
          <option value="releaseCount">Сортировка: релизы</option>
        </select>
        <div className="flex gap-2">
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as "asc" | "desc")}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          >
            <option value="desc">DESC</option>
            <option value="asc">ASC</option>
          </select>
          <select
            value={perPage}
            onChange={(event) => setPerPage(Number(event.target.value))}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
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
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Дата регистрации</th>
                <th className="px-3 py-3">Подписка</th>
                <th className="px-3 py-3">Баланс</th>
                <th className="px-3 py-3">Релизы</th>
                <th className="px-3 py-3">Статус</th>
                <th className="px-3 py-3">Действие</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-[14px] text-white/60">
                    {loading ? "Загрузка..." : "Пользователи не найдены."}
                  </td>
                </tr>
              ) : (
                data.items.map((user) => (
                  <tr key={user.id} className="border-b border-white/[0.06] last:border-none">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-white">{user.name}</p>
                          <p className="truncate text-[12px] text-white/60">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-white/65">{user.id}</td>
                    <td className="px-3 py-3 text-[13px] text-white/75">
                      {new Date(user.createdAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-white/75">
                      {user.subscriptionPlan && user.subscriptionStatus
                        ? `${user.subscriptionPlan} · ${user.subscriptionStatus}`
                        : "Нет"}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-white/85">{formatRubCurrency(user.balance)}</td>
                    <td className="px-3 py-3 text-[13px] text-white/85">{user.releaseCount}</td>
                    <td className="px-3 py-3 text-[13px]">
                      <span
                        className={
                          user.accountStatus === "ACTIVE"
                            ? "rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-100"
                            : "rounded-md border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 text-rose-200"
                        }
                      >
                        {user.accountStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="inline-flex rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 hover:bg-white/[0.08]"
                      >
                        Открыть
                      </Link>
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
            onClick={() => {
              void load(Math.max(1, data.page - 1));
            }}
            disabled={loading || data.page <= 1}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-[13px] text-white/85 hover:bg-white/[0.08] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Назад
          </button>
          <button
            type="button"
            onClick={() => {
              void load(Math.min(data.totalPages, data.page + 1));
            }}
            disabled={loading || data.page >= data.totalPages}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-[13px] text-white/85 hover:bg-white/[0.08] disabled:opacity-40"
          >
            Вперёд
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
