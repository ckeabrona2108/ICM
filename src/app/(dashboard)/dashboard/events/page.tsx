import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CalendarClock, ExternalLink, Plus, Ticket, Wallet } from "lucide-react";

import { authOptions } from "@/lib/auth";
import { getEventsByOrganizer, getEventTicketsByBuyer } from "@/lib/events-service";
import { DashboardEmptyState, DashboardShell, PageSection } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatEventDate, formatMoney } from "@/lib/events-shared";

export const dynamic = "force-dynamic";

const EVENTS_DASHBOARD_ACCESS_ENABLED = false;

export default async function EventsDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!EVENTS_DASHBOARD_ACCESS_ENABLED) redirect("/dashboard");

  const [events, tickets] = await Promise.all([
    getEventsByOrganizer(session.user.id),
    getEventTicketsByBuyer(session.user.id)
  ]);

  return (
    <DashboardShell>
      <PageHeader
        title="Events & Tickets"
        description="Создавайте страницы концертов, управляйте билетами, отслеживайте продажи и держите check-in внутри кабинета ICECREAMMUSIC."
        actions={
          <Link href="/dashboard/events/new">
            <Button size="lg" className="gap-2">
              <Plus className="h-4 w-4" />
              Новое событие
            </Button>
          </Link>
        }
      />

      {events.length === 0 ? (
        <DashboardEmptyState
          title="Пока нет событий"
          description="Создайте первую концертную или клубную страницу, настройте билеты и получите публичную ссылку для продвижения."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {events.map((event) => (
            <PageSection key={event.id} className="overflow-hidden">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-2xl font-semibold text-white">{event.title}</p>
                    <p className="mt-1 text-sm text-white/60">
                      {event.eventTypeLabel} · {event.city || "Город не указан"}
                    </p>
                    <p className="mt-2 inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/62">
                      {event.statusLabel}
                    </p>
                  </div>

                  {event.coverImageUrl ? (
                    <img
                      src={event.coverImageUrl}
                      alt={event.title}
                      className="h-20 w-20 rounded-[20px] border border-white/[0.08] object-cover"
                    />
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Старт</p>
                    <p className="mt-2 text-sm font-semibold text-white">{formatEventDate(event.startsAt)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Билеты</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {event.soldTickets} / {event.totalTickets}
                    </p>
                    <p className="mt-1 text-xs text-white/54">Осталось {event.remainingTickets}</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Выручка</p>
                    <p className="mt-2 text-sm font-semibold text-white">{formatMoney(event.grossRevenue)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-sm text-white/60">
                  {event.venueName ? <span>{event.venueName}</span> : null}
                  {event.artistSummary.length ? <span>· {event.artistSummary.join(", ")}</span> : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/events/${event.id}`}>
                    <Button variant="outline" className="gap-2">
                      <CalendarClock className="h-4 w-4" />
                      Управление
                    </Button>
                  </Link>
                  <a href={`/events/${event.slug}`} target="_blank" rel="noreferrer">
                    <Button variant="ghost" className="gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Публичная страница
                    </Button>
                  </a>
                </div>
              </div>
            </PageSection>
          ))}
        </div>
      )}

      <PageSection className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xl font-semibold text-white">Мои билеты</p>
            <p className="mt-1 text-sm text-white/58">
              Билеты, купленные из публичных страниц мероприятий, сохраняются здесь и доступны после оплаты.
            </p>
          </div>
          <Link href="/dashboard/events/tickets">
            <Button variant="outline" className="gap-2">
              <Ticket className="h-4 w-4" />
              Все билеты
            </Button>
          </Link>
        </div>

        {tickets.length === 0 ? (
          <DashboardEmptyState
            title="Пока нет купленных билетов"
            description="После покупки через страницу события билет появится в кабинете и будет доступен для показа на входе."
            className="py-12"
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tickets.slice(0, 6).map((ticket) => (
              <div key={ticket.id} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/42">{ticket.statusLabel}</p>
                <p className="mt-2 text-lg font-semibold text-white">{ticket.eventTitle}</p>
                <p className="mt-1 text-sm text-white/62">{ticket.ticketTypeName}</p>
                <p className="mt-3 text-xs text-white/46">Код билета</p>
                <p className="mt-1 font-mono text-sm text-white">{ticket.ticketCode}</p>
                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-white/52">
                  <span>{formatEventDate(ticket.purchaseAt)}</span>
                  <a
                    href={`/events/${ticket.eventSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-violet-200 transition hover:text-white"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Открыть
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </DashboardShell>
  );
}
