import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getEventTicketsByBuyer } from "@/lib/events-service";
import { DashboardEmptyState, DashboardShell, PageSection } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatEventDate } from "@/lib/events-shared";

export const dynamic = "force-dynamic";

const EVENTS_DASHBOARD_ACCESS_ENABLED = false;

export default async function EventTicketsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!EVENTS_DASHBOARD_ACCESS_ENABLED) redirect("/dashboard");

  const tickets = await getEventTicketsByBuyer(session.user.id);

  return (
    <DashboardShell>
      <PageHeader
        title="Мои билеты"
        description="После подтверждённой оплаты билет активируется, получает public check ссылку и сохраняется в кабинете вместе со статусом check-in."
        actions={
          <Link href="/dashboard/events">
            <Button variant="outline">К событиям</Button>
          </Link>
        }
      />

      {tickets.length === 0 ? (
        <DashboardEmptyState
          title="Нет сохранённых билетов"
          description="После покупки билета на публичной странице события он появится здесь вместе с public check ссылкой и статусом."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tickets.map((ticket) => (
            <PageSection key={ticket.id}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">{ticket.statusLabel}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{ticket.eventTitle}</p>
              <p className="mt-1 text-sm text-white/58">{ticket.ticketTypeName}</p>
              <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Ticket code</p>
                <p className="mt-2 font-mono text-base text-white">{ticket.ticketCode}</p>
              </div>
              <div className="mt-4 text-sm text-white/58">
                <p>Покупка: {formatEventDate(ticket.purchaseAt)}</p>
                {ticket.usedAt ? <p className="mt-1">Использован: {formatEventDate(ticket.usedAt)}</p> : null}
              </div>
              <div className="mt-5 grid gap-2">
                <a href={`/events/${ticket.eventSlug}`} target="_blank" rel="noreferrer">
                  <Button className="w-full">Открыть событие</Button>
                </a>
                {ticket.checkUrl ? (
                  <a href={ticket.checkUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline" className="w-full">Открыть билет</Button>
                  </a>
                ) : null}
              </div>
            </PageSection>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
