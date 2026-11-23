"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { AdminReferralRow } from "@/lib/referrals";

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}

function statusOf(row: AdminReferralRow): string {
  if (row.revokedAt) return `Отменено: ${row.revokeReason ?? ""}`;
  if (row.rewardedAt) return `Бонус выдан ${date(row.rewardedAt)}`;
  if (row.paidAt) return `Оплатил ${date(row.paidAt)}, бонус ${date(row.rewardDueAt)}`;
  return "Зарегистрировался";
}

export function AdminReferralsClient({ rows }: { rows: AdminReferralRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  const revoke = async (row: AdminReferralRow) => {
    const reason = window.prompt(`Отменить приглашение ${row.referredName} от ${row.referrerName}? Причина:`, "Накрутка");
    if (reason === null) return;
    setBusy(row.id);
    try {
      const response = await fetch(`/api/admin/referrals/${row.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        window.alert(payload?.error ?? "Не удалось отменить");
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) return <p className="mt-6 text-[14px] text-white/55">Приглашений пока нет.</p>;

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-white/[0.08]">
      <table className="w-full min-w-[820px] text-left text-[13px]">
        <thead className="bg-white/[0.04] text-[12px] text-white/50">
          <tr>
            <th className="px-3.5 py-3 font-semibold">Пригласил</th>
            <th className="px-3.5 py-3 font-semibold">Друг</th>
            <th className="px-3.5 py-3 font-semibold">Пришёл</th>
            <th className="px-3.5 py-3 font-semibold">Статус</th>
            <th className="px-3.5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05] text-white/80">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3.5 py-3">{row.referrerName}</td>
              <td className="px-3.5 py-3">{row.referredName}</td>
              <td className="px-3.5 py-3">{date(row.createdAt)}</td>
              <td className="px-3.5 py-3">{statusOf(row)}</td>
              <td className="px-3.5 py-3 text-right">
                {!row.revokedAt ? (
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void revoke(row)}
                    className="rounded-lg border border-rose-400/30 px-2.5 py-1 text-[12px] text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    {row.rewardedAt ? "Отменить бонус" : "Отменить"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
