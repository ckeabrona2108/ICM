"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/events-shared";

interface PublicTicketType {
  id: string;
  kind: string;
  kindLabel: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  quantityTotal: number;
  quantitySold: number;
  remaining: number;
  perUserLimit: number;
  salesStartAt: string;
  salesEndAt: string;
  enabled: boolean;
}

export function EventPublicPurchaseCard(props: {
  eventId: string;
  title: string;
  ticketTypes: PublicTicketType[];
  ticketSalesEnabled: boolean;
  totalRemaining: number;
  status: string;
  ticketTerms: string;
}) {
  const [ticketTypeId, setTicketTypeId] = React.useState(props.ticketTypes[0]?.id ?? "");
  const [quantity, setQuantity] = React.useState("1");
  const [buyerEmail, setBuyerEmail] = React.useState("");
  const [buyerName, setBuyerName] = React.useState("");
  const [buyerPhone, setBuyerPhone] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState<null | {
    orderId: string;
    orderNumber: string;
    totalAmount: number;
    currency: string;
    status: "payment_pending" | "paid";
    confirmationUrl: string | null;
    tickets: Array<{ ticketCode: string; statusLabel: string }>;
  }>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const selectedTicketType =
    props.ticketTypes.find((ticketType) => ticketType.id === ticketTypeId) ?? props.ticketTypes[0] ?? null;
  const canBuy = props.ticketSalesEnabled && props.status !== "CANCELLED" && props.totalRemaining > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/events/${props.eventId}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketTypeId,
          quantity: Number(quantity),
          buyerEmail,
          buyerName,
          buyerPhone
        })
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Не удалось оформить билет.");
      }
      setSuccess({
        orderId: json.orderId,
        orderNumber: json.orderNumber,
        totalAmount: json.totalAmount,
        currency: json.currency,
        status: json.status,
        confirmationUrl: json.confirmationUrl,
        tickets: json.tickets ?? []
      });
      if (json.confirmationUrl) {
        window.location.href = json.confirmationUrl;
        return;
      }
      setBuyerEmail("");
      setBuyerName("");
      setBuyerPhone("");
      setQuantity("1");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось оформить билет.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-[32px] border border-white/[0.08] bg-[#0c1018]/88 p-5 shadow-[0_24px_72px_-44px_rgba(0,0,0,0.88)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-semibold text-white">Купить билет</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">
            Покупатель платит ровно ту цену, которую видит в карточке. В стоимость уже включены все сборы.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Осталось</p>
          <p className="mt-1 text-xl font-semibold text-white">{props.totalRemaining}</p>
        </div>
      </div>

      {!canBuy ? (
        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-100">
          Продажа билетов сейчас недоступна. Событие ещё не опубликовано, распродано или продажи отключены организатором.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-[1.6fr,0.7fr]">
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-white/44">
              Тип билета
            </label>
            <Select
              value={ticketTypeId}
              onChange={(event) => setTicketTypeId(event.target.value)}
              options={props.ticketTypes.map((ticketType) => ({
                value: ticketType.id,
                label: `${ticketType.name} · ${formatMoney(ticketType.price, ticketType.currency)}`
              }))}
            />
          </div>
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-white/44">
              Количество
            </label>
            <Input
              type="number"
              min={1}
              max={selectedTicketType?.perUserLimit ?? 10}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-white/44">
              Email
            </label>
            <Input
              type="email"
              value={buyerEmail}
              onChange={(event) => setBuyerEmail(event.target.value)}
              placeholder="name@email.com"
            />
          </div>
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-white/44">
              Имя
            </label>
            <Input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="Имя гостя" />
          </div>
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-white/44">
              Телефон
            </label>
            <Input value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} placeholder="+7 ..." />
          </div>
        </div>

        {selectedTicketType ? (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-white/64">
            <p className="font-semibold text-white">
              {selectedTicketType.name}: {formatMoney(selectedTicketType.price, selectedTicketType.currency)}
            </p>
            <p className="mt-1">Лимит на одного покупателя: {selectedTicketType.perUserLimit}</p>
            {props.ticketTerms ? <p className="mt-2 leading-6">{props.ticketTerms}</p> : null}
          </div>
        ) : null}

        {error ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-50">
            <p className="font-semibold">Заказ оформлен для {props.title}</p>
            <p className="mt-1">
              Сумма: {formatMoney(success.totalAmount, success.currency)} · заказ {success.orderNumber}
            </p>
            <p className="mt-2">
              {success.status === "payment_pending"
                ? "Перенаправляем на оплату. Билеты станут активны только после подтверждённого платежа."
                : "Оплата подтверждена. Билеты активированы и отправлены на email."}
            </p>
            {success.tickets.length ? (
              <div className="mt-3 space-y-1">
                {success.tickets.map((ticket) => (
                  <p key={ticket.ticketCode} className="font-mono text-xs">
                    {ticket.ticketCode} · {ticket.statusLabel}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!canBuy || isSubmitting}>
          {isSubmitting ? "Оформляем билет..." : "Перейти к оплате"}
        </Button>
      </form>
    </div>
  );
}
