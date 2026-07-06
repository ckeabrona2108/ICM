import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Music4, Route, Ticket } from "lucide-react";

import { getEventPublicView } from "@/lib/events-service";
import { buildMapsUrl, formatEventDate, formatMoney } from "@/lib/events-shared";
import { EventPublicPurchaseCard } from "@/components/events/event-public-purchase-card";
import { YandexVenueMap } from "@/components/events/yandex-venue-map";

export const dynamic = "force-dynamic";

export default async function PublicEventPage({
  params
}: {
  params: { slug: string };
}) {
  const event = await getEventPublicView(params.slug);
  if (!event) notFound();

  const mapsUrl = buildMapsUrl({
    latitude: event.venue.latitude,
    longitude: event.venue.longitude,
    address: event.address
  });

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#090b11] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(123,61,245,0.18),transparent_48%),linear-gradient(180deg,#0a0c12_0%,#10131a_58%,#0b0d12_100%)]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 xl:flex-row xl:items-start">
        <section className="w-full xl:max-w-[460px] xl:shrink-0">
          <div className="overflow-hidden rounded-[36px] border border-white/[0.08] bg-white/[0.04] p-4 shadow-[0_28px_80px_-44px_rgba(0,0,0,0.82)]">
            <div className="aspect-square overflow-hidden rounded-[28px] border border-white/[0.08] bg-black/25">
              {event.coverImageUrl || event.posterImageUrl ? (
                <img
                  src={event.coverImageUrl || event.posterImageUrl}
                  alt={event.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-semibold uppercase tracking-[0.24em] text-white/36">
                  Event Cover
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="w-full min-w-0">
          <div className="rounded-[36px] border border-white/[0.08] bg-[#11141d]/85 p-6 shadow-[0_30px_84px_-48px_rgba(0,0,0,0.88)] backdrop-blur-md sm:p-8">
            <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-white/55">
              Events & Tickets
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">{event.title}</h1>
            <p className="mt-4 text-lg font-medium text-white/76">
              {event.eventTypeLabel} · {event.statusLabel}
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                <div className="flex items-center gap-2 text-white/58">
                  <CalendarDays className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Дата и время</span>
                </div>
                <p className="mt-3 text-base font-semibold text-white">{formatEventDate(event.startsAt)}</p>
                {event.endsAt ? <p className="mt-1 text-sm text-white/54">До {formatEventDate(event.endsAt)}</p> : null}
              </div>

              <div className="rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                <div className="flex items-center gap-2 text-white/58">
                  <MapPin className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">Площадка</span>
                </div>
                <p className="mt-3 text-base font-semibold text-white">{event.venueName || event.city || "Локация будет объявлена"}</p>
                {event.address ? <p className="mt-1 text-sm text-white/54">{event.address}</p> : null}
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-violet-200 transition hover:text-white"
                  >
                    <Route className="h-4 w-4" />
                    Построить маршрут
                  </a>
                ) : null}
              </div>
            </div>

            {(mapsUrl || (typeof event.venue.latitude === "number" && typeof event.venue.longitude === "number")) ? (
              <div className="mt-8 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/58">Карта площадки</p>
                    <p className="mt-2 text-sm text-white/54">Откройте место прямо на странице или постройте маршрут в Яндекс Картах.</p>
                  </div>
                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-violet-200 transition hover:text-white"
                    >
                      <Route className="h-4 w-4" />
                      Открыть в Яндекс Картах
                    </a>
                  ) : null}
                </div>
                <YandexVenueMap
                  latitude={event.venue.latitude}
                  longitude={event.venue.longitude}
                  title={event.venueName || event.title}
                  address={event.address}
                  className="h-[360px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-black/20"
                  emptyMessage="Координаты площадки пока не указаны."
                />
              </div>
            ) : null}

            {event.description ? <p className="mt-8 max-w-4xl text-[15px] leading-7 text-white/72">{event.description}</p> : null}

            {event.hashtags.length || event.genres.length ? (
              <div className="mt-8 flex flex-wrap gap-2">
                {[...event.hashtags, ...event.genres].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-sm font-medium text-white/68"
                  >
                    #{item}
                  </span>
                ))}
              </div>
            ) : null}

            {event.artists.length ? (
              <div className="mt-8">
                <div className="mb-4 flex items-center gap-2 text-white/62">
                  <Music4 className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]">Участники</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {event.artists.map((artist) => (
                    <div key={artist.id} className="rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                          {artist.photoUrl ? (
                            <img src={artist.photoUrl} alt={artist.displayName} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-white">{artist.displayName}</p>
                          <p className="truncate text-sm text-white/55">{artist.roleLabel}</p>
                        </div>
                      </div>
                      {artist.performanceTime ? (
                        <p className="mt-3 text-sm text-white/55">Слот: {artist.performanceTime}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {event.images.length ? (
              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {event.images.map((image) => (
                  <div key={image.id} className="overflow-hidden rounded-3xl border border-white/[0.08] bg-black/20">
                    <img src={image.imageUrl} alt={image.altText || event.title} className="aspect-[4/3] w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-8">
              <div className="mb-4 flex items-center gap-2 text-white/62">
                <Ticket className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em]">Билеты</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {event.ticketTypes.map((ticketType) => (
                  <div key={ticketType.id} className="rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-white">{ticketType.name}</p>
                        <p className="mt-1 text-sm text-white/58">{ticketType.kindLabel}</p>
                      </div>
                      <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-right">
                        <p className="text-sm font-semibold text-violet-100">{formatMoney(ticketType.price, ticketType.currency)}</p>
                      </div>
                    </div>
                    {ticketType.description ? <p className="mt-3 text-sm leading-6 text-white/62">{ticketType.description}</p> : null}
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                      Осталось {ticketType.remaining} из {ticketType.quantityTotal}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <EventPublicPurchaseCard
                eventId={event.id}
                title={event.title}
                ticketTypes={event.ticketTypes}
                ticketSalesEnabled={event.ticketSalesEnabled}
                totalRemaining={event.totalRemaining}
                status={event.status}
                ticketTerms={event.ticketTerms}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
