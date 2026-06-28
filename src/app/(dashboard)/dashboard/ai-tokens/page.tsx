import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Coins } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { authOptions } from "@/lib/auth";
import { formatAiTokenAmount } from "@/lib/ai-studio";
import { getAiPendingTokenBalance } from "@/lib/ai-studio-activation";
import { getAiTokenBalance, listAiTokenTransactions, type AiTokenTransactionRecord } from "@/lib/ai-token-service";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

const tokenHistoryFilterOptions = [
  { value: "all", label: "Все" },
  { value: "topup", label: "Пополнения" },
  { value: "generation", label: "Генерации" },
  { value: "chat", label: "Чаты" },
  { value: "admin_adjustment", label: "Корректировки" },
  { value: "credited", label: "Начисления" },
  { value: "spent", label: "Списания" }
] as const;

type TokenHistoryFilter = (typeof tokenHistoryFilterOptions)[number]["value"];

function formatTransactionType(type: string) {
  switch (type) {
    case "topup":
      return "Пополнение";
    case "generation":
      return "Генерация";
    case "chat":
      return "Чат";
    case "admin_adjustment":
      return "Ручная корректировка";
    default:
      return type;
  }
}

function formatTransactionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function resolveTransactionDirection(amount: number) {
  if (amount > 0) {
    return {
      label: "Начисление",
      icon: ArrowUpRight,
      tone: "text-emerald-200 border-emerald-400/20 bg-emerald-500/10"
    };
  }

  return {
    label: "Списание",
    icon: ArrowDownRight,
    tone: "text-rose-200 border-rose-400/20 bg-rose-500/10"
  };
}

function summarizeTransactions(transactions: AiTokenTransactionRecord[]) {
  return transactions.reduce(
    (acc, item) => {
      if (item.amountTokens > 0) {
        acc.credited += item.amountTokens;
      } else if (item.amountTokens < 0) {
        acc.spent += Math.abs(item.amountTokens);
      }
      return acc;
    },
    { credited: 0, spent: 0 }
  );
}

function resolveTokenHistoryFilter(value: string | string[] | undefined): TokenHistoryFilter {
  if (typeof value !== "string") return "all";
  return tokenHistoryFilterOptions.some((item) => item.value === value)
    ? (value as TokenHistoryFilter)
    : "all";
}

function filterTransactions(transactions: AiTokenTransactionRecord[], filter: TokenHistoryFilter) {
  switch (filter) {
    case "topup":
    case "generation":
    case "chat":
    case "admin_adjustment":
      return transactions.filter((item) => item.type === filter);
    case "credited":
      return transactions.filter((item) => item.amountTokens > 0);
    case "spent":
      return transactions.filter((item) => item.amountTokens < 0);
    default:
      return transactions;
  }
}

function StatCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-[#13161f]/88 p-5 shadow-[0_20px_60px_-42px_rgba(0,0,0,0.78)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">{label}</div>
      <div className="mt-3 text-[28px] font-semibold text-white">{value}</div>
      <div className="mt-2 text-[13px] leading-6 text-white/58">{hint}</div>
    </div>
  );
}

export default async function AiTokensHistoryPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeFilter = resolveTokenHistoryFilter(resolvedSearchParams?.filter);

  const [balance, pendingBalance, transactions] = await Promise.all([
    getAiTokenBalance(prisma, session.user.id),
    getAiPendingTokenBalance(prisma, session.user.id),
    listAiTokenTransactions(prisma, session.user.id, 100)
  ]);

  const filteredTransactions = filterTransactions(transactions, activeFilter);
  const summary = summarizeTransactions(transactions);
  const totalTurnover = summary.credited + summary.spent;

  return (
    <div className="pb-10">
      <PageHeader
        title="История AI-токенов"
        description="Все начисления, покупки, списания за генерации и операции администратора по вашему AI-балансу."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/ai-studio/image?buyTokens=1"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 text-[14px] font-medium text-white/88 transition hover:bg-white/[0.07]"
            >
              Купить токены
            </Link>
            <Link
              href="/dashboard/ai-studio/image"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#7b3df5] px-4 text-[14px] font-semibold text-white transition hover:opacity-95"
            >
              Перейти в AI Studio
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Доступно"
          value={`${formatAiTokenAmount(balance)} AI`}
          hint="Текущий баланс, который можно тратить на чат, изображения, видео и аудио."
        />
        <StatCard
          label="В ожидании"
          value={`${formatAiTokenAmount(pendingBalance)} AI`}
          hint="Оплаченные токены, которые ждут активации, если AI Studio сейчас в режиме подготовки."
        />
        <StatCard
          label="Оборот"
          value={`${formatAiTokenAmount(totalTurnover)} AI`}
          hint="Общий объём всех операций по вашему AI-аккаунту за доступную историю."
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#12151d]/92 shadow-[0_24px_70px_-44px_rgba(0,0,0,0.82)]">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4 sm:px-6">
          <div>
            <div className="text-[18px] font-semibold text-white">Операции</div>
            <div className="mt-1 text-[13px] text-white/54">
              Показано {filteredTransactions.length} из {transactions.length} записей по вашему AI-кошельку.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-white/[0.06] px-5 py-4 sm:px-6">
          {tokenHistoryFilterOptions.map((option) => {
            const isActive = option.value === activeFilter;
            return (
              <Link
                key={option.value}
                href={option.value === "all" ? "/dashboard/ai-tokens" : `/dashboard/ai-tokens?filter=${option.value}`}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-full border px-4 text-[13px] font-medium transition",
                  isActive
                    ? "border-[#7b3df5]/40 bg-[#7b3df5]/12 text-white"
                    : "border-white/[0.10] bg-white/[0.03] text-white/68 hover:border-white/[0.18] hover:bg-white/[0.05] hover:text-white"
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>

        {transactions.length === 0 ? (
          <div className="grid place-items-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
              <Coins className="h-7 w-7 text-white/48" />
            </div>
            <div className="mt-5 text-[20px] font-semibold text-white">История токенов пока пуста</div>
            <div className="mt-2 max-w-xl text-[14px] leading-7 text-white/58">
              Когда появятся первые покупки, бонусы подписки или списания за генерации, все операции автоматически
              появятся здесь.
            </div>
            <Link
              href="/dashboard/ai-studio/image"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#7b3df5] px-5 text-[14px] font-semibold text-white transition hover:opacity-95"
            >
              Открыть AI Studio
            </Link>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="grid place-items-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
              <Coins className="h-7 w-7 text-white/48" />
            </div>
            <div className="mt-5 text-[20px] font-semibold text-white">По этому фильтру операций нет</div>
            <div className="mt-2 max-w-xl text-[14px] leading-7 text-white/58">
              Попробуйте переключить тип операций выше. История токенов не удалена, сейчас просто нет записей,
              подходящих под выбранный фильтр.
            </div>
            <Link
              href="/dashboard/ai-tokens"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 text-[14px] font-semibold text-white transition hover:bg-white/[0.07]"
            >
              Сбросить фильтр
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[150px_140px_minmax(0,1fr)_140px_140px] items-center gap-4 border-b border-white/[0.06] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42 lg:grid">
              <div>Дата</div>
              <div>Тип</div>
              <div>Описание</div>
              <div>Сумма</div>
              <div>Баланс после</div>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {filteredTransactions.map((item) => {
                const direction = resolveTransactionDirection(item.amountTokens);
                const DirectionIcon = direction.icon;

                return (
                  <div key={item.id} className="px-5 py-4 sm:px-6">
                    <div className="hidden items-center gap-4 lg:grid lg:grid-cols-[150px_140px_minmax(0,1fr)_140px_140px]">
                      <div className="text-[13px] text-white/58">{formatTransactionDate(item.createdAt)}</div>
                      <div>
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium", direction.tone)}>
                          <DirectionIcon className="h-3.5 w-3.5" />
                          {formatTransactionType(item.type)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-medium text-white">
                          {item.description?.trim() || "Операция с AI-токенами"}
                        </div>
                        {item.packageCode ? (
                          <div className="mt-1 text-[12px] text-white/48">Пакет: {item.packageCode}</div>
                        ) : null}
                      </div>
                      <div className={cn("text-[15px] font-semibold", item.amountTokens > 0 ? "text-emerald-200" : "text-rose-200")}>
                        {item.amountTokens > 0 ? "+" : ""}
                        {formatAiTokenAmount(Math.abs(item.amountTokens))} AI
                      </div>
                      <div className="text-[14px] font-medium text-white/76">
                        {formatAiTokenAmount(item.balanceAfter)} AI
                      </div>
                    </div>

                    <div className="space-y-3 lg:hidden">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-medium text-white">
                            {item.description?.trim() || "Операция с AI-токенами"}
                          </div>
                          <div className="mt-1 text-[12px] text-white/50">{formatTransactionDate(item.createdAt)}</div>
                        </div>
                        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium", direction.tone)}>
                          <DirectionIcon className="h-3.5 w-3.5" />
                          {formatTransactionType(item.type)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 rounded-[20px] border border-white/[0.06] bg-black/20 p-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Сумма</div>
                          <div className={cn("mt-1 text-[15px] font-semibold", item.amountTokens > 0 ? "text-emerald-200" : "text-rose-200")}>
                            {item.amountTokens > 0 ? "+" : ""}
                            {formatAiTokenAmount(Math.abs(item.amountTokens))} AI
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Баланс после</div>
                          <div className="mt-1 text-[15px] font-semibold text-white/80">
                            {formatAiTokenAmount(item.balanceAfter)} AI
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Детали</div>
                          <div className="mt-1 text-[13px] text-white/60">
                            {item.packageCode ? `Код пакета: ${item.packageCode}` : "Операция без пакетного кода"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
