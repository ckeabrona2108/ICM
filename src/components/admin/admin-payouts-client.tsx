// @ts-nocheck
"use client";

import * as React from "react";

import type { AdminPayoutDetails, AdminPayoutStatus } from "@/lib/admin-payouts-service";
import { cn } from "@/lib/utils";
import { canMoveToPaid, canMoveToProcessing, canMoveToRejected } from "@/lib/payouts";

type AdminPayoutItem = AdminPayoutDetails;

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2
  }).format(value);
}

function statusLabel(status: AdminPayoutStatus): string {
  if (status === "REQUESTED") return "Ожидает";
  if (status === "PROCESSING") return "В обработке";
  if (status === "PAID") return "Оплачено";
  return "Отклонено";
}

function statusTone(status: AdminPayoutStatus): "muted" | "warning" | "success" | "danger" {
  if (status === "PAID") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "PROCESSING") return "warning";
  return "muted";
}

function methodLabel(method: "BANK_TRANSFER"): string {
  if (method === "BANK_TRANSFER") return "Банковский перевод";
  return "Иной способ";
}

export function AdminPayoutsClient({ initialPayouts }: { initialPayouts: AdminPayoutItem[] }) {
  const [items, setItems] = React.useState<AdminPayoutItem[]>(initialPayouts);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function doAction(id: string, action: "processing" | "paid" | "reject") {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/finance/payouts/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const parsed = (await res.json().catch(() => null)) as
        | { ok?: boolean; payoutRequestId?: string; status?: AdminPayoutStatus; error?: string }
        | null;

      if (!res.ok || !parsed || parsed.ok !== true || !parsed.status) {
        setError(parsed?.error ?? "Не удалось обновить статус выплаты.");
        return;
      }

      setItems((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: parsed.status as AdminPayoutStatus,
                updatedAt: new Date().toISOString(),
                processedAt:
                  parsed.status === "PAID" ||
                  parsed.status === "REJECTED"
                    ? new Date().toISOString()
                    : p.processedAt
              }
            : p
        )
      );
    } catch {
      setError("Сервис админ-выплат временно недоступен. Повторите позже.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {error ? (
        <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#161720] px-5 py-6 text-[14px] text-white/60">
          Заявок на выплату пока нет.
        </div>
      ) : (
        items.map((payout) => (
          <div
            key={payout.id}
            className="rounded-2xl border border-white/[0.06] bg-[#161720] px-5 py-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[15px] font-medium text-white">{payout.user.name}</p>
                <p className="mt-0.5 text-[12.5px] text-white/50">{payout.user.email}</p>
              </div>

              <span
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[12px]",
                  statusTone(payout.status) === "success" &&
                    "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
                  statusTone(payout.status) === "danger" &&
                    "border-rose-400/25 bg-rose-400/10 text-rose-100",
                  statusTone(payout.status) === "warning" &&
                    "border-amber-400/25 bg-amber-400/10 text-amber-100",
                  statusTone(payout.status) === "muted" &&
                    "border-white/[0.12] bg-white/[0.04] text-white/80"
                )}
              >
                {statusLabel(payout.status)}
              </span>
            </div>

            <div className="mt-2 grid gap-1.5 text-[13px] text-white/65 sm:grid-cols-2">
              <p>
                Сумма: <span className="text-white/85">{formatRub(payout.amount)}</span>
              </p>
              <p>
                Способ: <span className="text-white/85">{methodLabel(payout.method)}</span>
              </p>
              <p>
                Получатель:{" "}
                <span className="text-white/85">{payout.recipientName || "Не указан"}</span>
              </p>
              <p>
                Реквизиты:{" "}
                <span className="text-white/85">{payout.accountDetails || "Не указаны"}</span>
              </p>
              <p>
                Банк: <span className="text-white/85">{payout.bankName || "Не указан"}</span>
              </p>
              <p>
                ИНН / Налоговый ID:{" "}
                <span className="text-white/85">{payout.taxId || "Не указан"}</span>
              </p>
              <p className="sm:col-span-2">
                Дата заявки:{" "}
                <span className="text-white/85">
                  {new Date(payout.createdAt).toLocaleDateString("ru-RU")}
                </span>
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton
                disabled={busyId === payout.id || !canMoveToProcessing(payout.status)}
                onClick={() => void doAction(payout.id, "processing")}
              >
                В обработку
              </ActionButton>
              <ActionButton
                disabled={
                  busyId === payout.id ||
                  !canMoveToPaid(payout.status)
                }
                onClick={() => void doAction(payout.id, "paid")}
              >
                Оплачено
              </ActionButton>
              <ActionButton
                tone="danger"
                disabled={
                  busyId === payout.id ||
                  !canMoveToRejected(payout.status)
                }
                onClick={() => void doAction(payout.id, "reject")}
              >
                Отклонить
              </ActionButton>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
        tone === "danger"
          ? "border-rose-400/25 bg-rose-400/10 text-rose-100 hover:border-rose-400/35 hover:bg-rose-400/15"
          : "border-white/[0.10] bg-white/[0.04] text-white/80 hover:border-white/[0.18] hover:bg-white/[0.06]",
        disabled && "cursor-not-allowed opacity-40 hover:bg-white/[0.04]"
      )}
    >
      {children}
    </button>
  );
}
