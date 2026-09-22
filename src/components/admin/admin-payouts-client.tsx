// @ts-nocheck
"use client";

import * as React from "react";

import type { AdminPayoutDetails, AdminPayoutStatus } from "@/lib/admin-payouts-service";
import { cn } from "@/lib/utils";
import { canMoveToPaid, canMoveToProcessing, canMoveToRejected } from "@/lib/payouts";

type AdminPayoutItem = AdminPayoutDetails;

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU");
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

function StatusBadge({ status }: { status: AdminPayoutStatus }) {
  const tone = statusTone(status);
  return <span className={cn(
    "rounded-lg border px-2.5 py-1 text-[12px]",
    tone === "success" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    tone === "danger" && "border-rose-400/25 bg-rose-400/10 text-rose-100",
    tone === "warning" && "border-amber-400/25 bg-amber-400/10 text-amber-100",
    tone === "muted" && "border-white/[0.12] bg-white/[0.04] text-white/80"
  )}>{statusLabel(status)}</span>;
}

export function AdminPayoutsClient({ initialPayouts }: { initialPayouts: AdminPayoutItem[] }) {
  const [items, setItems] = React.useState<AdminPayoutItem[]>(initialPayouts);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [openedPayout, setOpenedPayout] = React.useState<AdminPayoutItem | null>(null);
  const [rejectingPayout, setRejectingPayout] = React.useState<AdminPayoutItem | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");

  async function doAction(id: string, action: "processing" | "paid" | "reject", reason?: string) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/finance/payouts/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(action === "reject" ? { body: JSON.stringify({ reason }) } : {})
      });
      const parsed = (await res.json().catch(() => null)) as { ok?: boolean; status?: AdminPayoutStatus; error?: string } | null;
      if (!res.ok || !parsed?.ok || !parsed.status) {
        setError(parsed?.error ?? "Не удалось обновить статус выплаты.");
        return;
      }
      const updatedAt = new Date().toISOString();
      const update = (item: AdminPayoutItem) => item.id !== id ? item : {
        ...item,
        status: parsed.status,
        updatedAt,
        processedAt: ["PROCESSING", "PAID", "REJECTED"].includes(parsed.status) ? updatedAt : item.processedAt,
        rejectionReason: parsed.status === "REJECTED" ? reason?.trim() || item.rejectionReason : item.rejectionReason
      };
      setItems((previous) => previous.map(update));
      setOpenedPayout((item) => item ? update(item) : null);
      if (action === "reject") { setRejectingPayout(null); setRejectionReason(""); }
    } catch {
      setError("Сервис админ-выплат временно недоступен. Повторите позже.");
    } finally {
      setBusyId(null);
    }
  }

  return <div className="mt-6 space-y-3">
    {error ? <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-200">{error}</div> : null}
    {items.length === 0 ? <div className="rounded-2xl border border-white/[0.06] bg-[#161720] px-5 py-6 text-[14px] text-white/60">Заявок на выплату пока нет.</div> : items.map((payout) => <article key={payout.id} className="rounded-2xl border border-white/[0.06] bg-[#161720] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[15px] font-medium text-white">{payout.user.name}</p><p className="mt-0.5 text-[12.5px] text-white/50">{payout.user.email}</p></div><StatusBadge status={payout.status} /></div>
      <div className="mt-2 grid gap-1.5 text-[13px] text-white/65 sm:grid-cols-2">
        <p>Сумма: <span className="text-white/85">{formatRub(payout.amount)}</span></p><p>Способ: <span className="text-white/85">Банковский перевод</span></p>
        <p>Получатель: <span className="text-white/85">{payout.recipientName || "Не указан"}</span></p><p>Дата заявки: <span className="text-white/85">{formatDate(payout.createdAt)}</span></p>
        <p>Договор: <span className="text-white/85">{payout.contractNumber ? `№ ${payout.contractNumber}` : "Не указан"}</span></p>
        {payout.payoutWindowLabel || payout.payoutPeriodLabel ? <p className="sm:col-span-2">Период выплат: <span className="text-white/85">{[payout.payoutPeriodLabel, payout.payoutWindowLabel].filter(Boolean).join(" · ")}</span></p> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton onClick={() => setOpenedPayout(payout)}>Открыть заявку</ActionButton>
        <ActionButton disabled={busyId === payout.id || !canMoveToProcessing(payout.status)} onClick={() => void doAction(payout.id, "processing")}>В обработку</ActionButton>
        <ActionButton disabled={busyId === payout.id || !canMoveToPaid(payout.status)} onClick={() => void doAction(payout.id, "paid")}>Оплачено</ActionButton>
        <ActionButton tone="danger" disabled={busyId === payout.id || !canMoveToRejected(payout.status)} onClick={() => { setRejectingPayout(payout); setRejectionReason(""); }}>Отклонить</ActionButton>
      </div>
    </article>)}
    {openedPayout ? <PayoutDetailsModal payout={openedPayout} onClose={() => setOpenedPayout(null)} /> : null}
    {rejectingPayout ? <RejectModal payout={rejectingPayout} reason={rejectionReason} setReason={setRejectionReason} busy={busyId === rejectingPayout.id} onClose={() => setRejectingPayout(null)} onConfirm={() => void doAction(rejectingPayout.id, "reject", rejectionReason)} /> : null}
  </div>;
}

function PayoutDetailsModal({ payout, onClose }: { payout: AdminPayoutItem; onClose: () => void }) {
  const labels: Record<string, string> = { passportSeries: "Серия паспорта", passportNumber: "Номер паспорта", passportIssuedBy: "Кем выдан", passportIssueDate: "Дата выдачи", birthDate: "Дата рождения", registrationAddress: "Адрес регистрации", contractNumber: "Номер договора" };
  return <Modal title="Заявка на выплату" onClose={onClose}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[14px] font-medium text-white">{payout.user.name}</p><p className="text-[13px] text-white/50">{payout.user.email}</p></div><StatusBadge status={payout.status} /></div>
    <DetailSection title="Выплата" rows={[["Сумма", formatRub(payout.amount)], ["Лицензионный договор", payout.contractNumber ? `№ ${payout.contractNumber}` : "Не указан"], ["Отчётный период", payout.quarter && payout.year ? `${payout.quarter} квартал ${payout.year}` : "Не указан"], ["Окно выплат", [payout.payoutPeriodLabel, payout.payoutWindowLabel].filter(Boolean).join(" · ") || "Не указано"], ["Отчёт", payout.reportId || "Не указан"]]} />
    <DetailSection title="Получатель и реквизиты" rows={[["Статус", payout.taxStatus === "self_employed" ? "Самозанятый" : payout.taxStatus === "individual" ? "Физическое лицо" : "Не указан"], ["Получатель", payout.recipientName || "Не указан"], ["Банк", payout.bankName || "Не указан"], ["Счёт", payout.accountDetails || "Не указан"], ["БИК", payout.bankBik || "Не указан"], ["ИНН", payout.taxId || "Не указан"]]} />
    <DetailSection title="Документы пользователя" rows={[]}>
      {payout.supportingDocument ? <a className="inline-flex rounded-lg border border-[#9f7aea]/40 bg-[#7b3df5]/15 px-3 py-2 text-[13px] font-medium text-[#dfd4ff] hover:bg-[#7b3df5]/25" href={`/api/finance/payouts/document?key=${encodeURIComponent(payout.supportingDocument.key)}&download=1`}>Скачать: {payout.supportingDocument.name}</a> : <p className="text-[13px] text-white/50">Пользователь не прикрепил документ.</p>}
      {payout.receiptAcknowledged ? <p className="mt-3 text-[12.5px] text-emerald-100">Пользователь подтвердил, что расписка переписана от руки и подписана.</p> : null}
    </DetailSection>
    {payout.receiptDetails ? <DetailSection title="Данные расписки" rows={Object.entries(payout.receiptDetails).map(([key, value]) => [labels[key] || key, value])} /> : null}
    {payout.rejectionReason ? <DetailSection title="Причина отклонения" rows={[["Комментарий администратора", payout.rejectionReason]]} /> : null}
  </Modal>;
}

function RejectModal({ payout, reason, setReason, busy, onClose, onConfirm }: { payout: AdminPayoutItem; reason: string; setReason: (value: string) => void; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <Modal title="Отклонить заявку" onClose={onClose}><p className="text-[14px] leading-relaxed text-white/65">Укажите причину. Она будет отправлена пользователю вместе с возможностью создать исправленную заявку.</p><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Например: приложенный документ не соответствует сумме выплаты." className="mt-4 min-h-28 w-full rounded-xl border border-white/[0.12] bg-black/20 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-[#9f7aea]/70" /><div className="mt-4 flex justify-end gap-2"><ActionButton onClick={onClose}>Отмена</ActionButton><ActionButton tone="danger" disabled={busy || reason.trim().length < 3} onClick={onConfirm}>{busy ? "Отклонение..." : "Подтвердить отклонение"}</ActionButton></div></Modal>;
}

function DetailSection({ title, rows, children }: { title: string; rows: [string, string][]; children?: React.ReactNode }) {
  return <section className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5"><h3 className="text-[13px] font-semibold text-white">{title}</h3>{rows.length > 0 ? <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-white/45">{label}</dt><dd className="mt-0.5 break-words text-white/85">{value}</dd></div>)}</dl> : null}{children ? <div className="mt-3">{children}</div> : null}</section>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/[0.12] bg-[#161720] p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><h2 className="text-[20px] font-semibold text-white">{title}</h2><button type="button" onClick={onClose} className="rounded-lg border border-white/[0.1] px-2.5 py-1 text-[13px] text-white/70 hover:bg-white/[0.06]">Закрыть</button></div><div className="mt-4">{children}</div></div></div>;
}

function ActionButton({ children, onClick, disabled, tone }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "default" | "danger" }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={cn("rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors", tone === "danger" ? "border-rose-400/25 bg-rose-400/10 text-rose-100 hover:border-rose-400/35 hover:bg-rose-400/15" : "border-white/[0.10] bg-white/[0.04] text-white/80 hover:border-white/[0.18] hover:bg-white/[0.06]", disabled && "cursor-not-allowed opacity-40 hover:bg-white/[0.04]")}>{children}</button>;
}
