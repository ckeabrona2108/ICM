import { ShieldCheck, ShieldX, Ticket } from "lucide-react";

import { getPublicTicketCheckView } from "@/lib/event-ticketing";
import { formatEventDate } from "@/lib/events-shared";

export const dynamic = "force-dynamic";

function toneFor(result: "valid" | "already_used" | "invalid" | "not_found") {
  if (result === "valid") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-50";
  if (result === "already_used") return "border-amber-400/30 bg-amber-500/10 text-amber-50";
  return "border-rose-400/30 bg-rose-500/10 text-rose-50";
}

export default async function TicketCheckPage({ params }: { params: { token: string } }) {
  const result = await getPublicTicketCheckView({ publicToken: params.token });

  return (
    <main className="min-h-screen bg-[#081018] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-[32px] border border-white/[0.08] bg-[#101826]/92 p-6 shadow-[0_28px_80px_-52px_rgba(0,0,0,0.92)] sm:p-8">
        <div className="flex items-center gap-3 text-white/60">
          <Ticket className="h-5 w-5" />
          <p className="text-xs font-semibold uppercase tracking-[0.24em]">ICECREAMMUSIC Ticket Check</p>
        </div>

        <div className={`mt-6 rounded-3xl border px-5 py-5 ${toneFor(result.result)}`}>
          <div className="flex items-center gap-3">
            {result.result === "valid" ? <ShieldCheck className="h-6 w-6" /> : <ShieldX className="h-6 w-6" />}
            <p className="text-2xl font-semibold">{result.label}</p>
          </div>
        </div>

        {result.ticket ? (
          <div className="mt-6 space-y-4 rounded-3xl border border-white/[0.08] bg-black/20 p-5 text-sm text-white/72">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Мероприятие</p>
              <p className="mt-2 text-lg font-semibold text-white">{result.ticket.eventTitle}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Тип билета</p>
                <p className="mt-2 text-base text-white">{result.ticket.ticketTypeName}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Статус оплаты</p>
                <p className="mt-2 text-base text-white">{result.ticket.paymentStatusLabel}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Дата события</p>
                <p className="mt-2 text-base text-white">{formatEventDate(result.ticket.eventDate)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Заказ</p>
                <p className="mt-2 text-base text-white">{result.ticket.orderNumberMasked ?? "Скрыт"}</p>
              </div>
            </div>
            {result.ticket.checkedInAt ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Первый check-in</p>
                <p className="mt-2 text-base text-white">{formatEventDate(result.ticket.checkedInAt)}</p>
              </div>
            ) : null}
            <p className="text-xs leading-6 text-white/46">Публичная проверка показывает только базовый статус билета и не позволяет изменить его состояние.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
