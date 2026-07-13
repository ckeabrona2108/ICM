"use client";

import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";

export type SubscriptionPurchaseStatus = "paid" | "incomplete" | "canceled";

export type SubscriptionPurchaseRow = {
  id: string;
  tariffLabel: string;
  amountRub: number;
  billingLabel: string;
  purchasedAt: string | null;
  endsAt: string | null;
  status: SubscriptionPurchaseStatus;
};

type PurchaseFilter = "all" | SubscriptionPurchaseStatus;

const FILTERS: Array<{ value: PurchaseFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "incomplete", label: "Не завершено" },
  { value: "paid", label: "Оплачено" },
  { value: "canceled", label: "Отменено" }
];

const STATUS_LABELS: Record<SubscriptionPurchaseStatus, string> = {
  paid: "Оплачено",
  incomplete: "Не завершено",
  canceled: "Отменено"
};

const STATUS_CLASS_NAMES: Record<SubscriptionPurchaseStatus, string> = {
  paid: "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200",
  incomplete: "border-amber-300/25 bg-amber-300/[0.08] text-amber-200",
  canceled: "border-rose-300/25 bg-rose-300/[0.08] text-rose-200"
};

export function SubscriptionPurchaseStats({
  currentPlan,
  currentEndsAt,
  purchases
}: {
  currentPlan: string | null;
  currentEndsAt: string | null;
  purchases: SubscriptionPurchaseRow[];
}) {
  const [filter, setFilter] = React.useState<PurchaseFilter>("all");
  const paidPurchases = React.useMemo(
    () => purchases.filter((purchase) => purchase.status === "paid"),
    [purchases]
  );
  const latestPaidPurchase = paidPurchases[0] ?? null;
  const filteredPurchases = React.useMemo(
    () =>
      filter === "all"
        ? purchases
        : purchases.filter((purchase) => purchase.status === filter),
    [filter, purchases]
  );

  const counts = React.useMemo(
    () => ({
      all: purchases.length,
      paid: purchases.filter((purchase) => purchase.status === "paid").length,
      incomplete: purchases.filter((purchase) => purchase.status === "incomplete").length,
      canceled: purchases.filter((purchase) => purchase.status === "canceled").length
    }),
    [purchases]
  );

  return (
    <Card className="mt-6">
      <CardContent>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[24px] font-bold tracking-[-0.03em] text-white">
              Покупки подписок
            </h2>
            <p className="mt-1 text-[14px] font-medium text-white/56">
              История оплат, тарифы и даты окончания подписок.
            </p>
          </div>
          {currentPlan ? (
            <div className="rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-4 py-2 text-[13px] font-semibold text-emerald-200">
              {`Активна: ${currentPlan}`}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <SubscriptionStatCard
            label="Оплачено подписок"
            value={String(paidPurchases.length)}
            hint={latestPaidPurchase ? `Последняя: ${latestPaidPurchase.tariffLabel}` : "Истории оплат пока нет"}
          />
          <SubscriptionStatCard
            label="Текущая подписка до"
            value={currentEndsAt ? formatDateTime(currentEndsAt) : "—"}
            hint={currentPlan ? currentPlan : "Подписка не активна"}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                className={
                  active
                    ? "rounded-full border border-violet-300/40 bg-violet-400/20 px-4 py-2 text-[13px] font-semibold text-white"
                    : "rounded-full border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-[13px] font-semibold text-white/62 hover:bg-white/[0.06] hover:text-white"
                }
                onClick={() => setFilter(item.value)}
              >
                {item.label} <span className="text-white/45">{counts[item.value]}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08]">
          <div className="hidden grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr] gap-3 border-b border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45 md:grid">
            <span>Тариф</span>
            <span>Оплата</span>
            <span>Окончание</span>
            <span>Сумма</span>
            <span>Статус</span>
          </div>

          {filteredPurchases.length ? (
            filteredPurchases.map((purchase) => (
              <div
                key={purchase.id}
                className="grid gap-2 border-b border-white/[0.06] px-4 py-4 last:border-b-0 md:grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr] md:items-center md:gap-3"
              >
                <div>
                  <p className="text-[15px] font-bold text-white">{purchase.tariffLabel}</p>
                  <p className="mt-0.5 text-[12px] font-medium text-white/40">
                    {purchase.billingLabel} · заказ {purchase.id.slice(0, 8)}
                  </p>
                </div>
                <MobileLabeledValue label="Оплата" value={formatDateTime(purchase.purchasedAt)} />
                <MobileLabeledValue
                  label="Окончание"
                  value={purchase.endsAt ? formatDateTime(purchase.endsAt) : "—"}
                  hint={
                    purchase.status === "paid"
                      ? purchase.billingLabel === "Годовая оплата"
                        ? "расчётно 12 месяцев"
                        : "расчётно 1 месяц"
                      : undefined
                  }
                />
                <MobileLabeledValue label="Сумма" value={formatRub(purchase.amountRub)} />
                <div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${STATUS_CLASS_NAMES[purchase.status]}`}
                  >
                    {STATUS_LABELS[purchase.status]}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-7 text-center text-[14px] font-medium text-white/50">
              По выбранному фильтру покупок нет.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionStatCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/42">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-[-0.03em] text-white">{value}</p>
      <p className="mt-1 text-[13px] font-medium text-white/48">{hint}</p>
    </div>
  );
}

function MobileLabeledValue({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/38 md:hidden">
        {label}
      </p>
      <p className="text-[14px] font-semibold text-white/72">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] font-medium text-white/38">{hint}</p> : null}
    </div>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
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

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(value);
}
