
import {
  EventAgeRestriction,
  EventArtistRole,
  EventPaymentStatus,
  EventStatus,
  EventTicketStatus,
  EventTicketTypeKind,
  EventType,
  Prisma
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  buildTicketCheckUrl,
  confirmEventTicketCheckIn,
  createEventTicketOrder
} from "@/lib/event-ticketing";
import { isAnyPrismaTableMissingError, isPrismaTableMissingError } from "@/lib/prisma-errors";

const DEFAULT_CURRENCY = "RUB";

const EVENT_FOUNDATION_TABLES = [
  "events",
  "event_ticket_types",
  "ticket_orders",
  "event_artists",
  "venues"
] as const;

const eventStatusLabels: Record<EventStatus, string> = {
  DRAFT: "Черновик",
  PENDING_MODERATION: "На модерации",
  PUBLISHED: "Опубликовано",
  SOLD_OUT: "Sold Out",
  CANCELLED: "Отменено",
  FINISHED: "Завершено",
  HIDDEN: "Скрыто"
};

const ticketStatusLabels: Record<EventTicketStatus, string> = {
  AVAILABLE: "Доступен",
  RESERVED: "Зарезервирован",
  PAID: "Оплачен",
  USED: "Использован",
  CANCELLED: "Отменён",
  REFUNDED: "Возврат",
  EXPIRED: "Истёк"
};

const ticketKindLabels: Record<EventTicketTypeKind, string> = {
  REGULAR: "Regular",
  EARLY_BIRD: "Early Bird",
  VIP: "VIP",
  BACKSTAGE: "Backstage",
  GUEST_LIST: "Guest List",
  FREE: "Free"
};

const artistRoleLabels: Record<EventArtistRole, string> = {
  HEADLINER: "Headliner",
  ARTIST: "Artist",
  DJ: "DJ",
  MC: "MC",
  GUEST: "Guest",
  HOST: "Host",
  SPECIAL_GUEST: "Special Guest"
};

const eventTypeLabels: Record<EventType, string> = {
  CONCERT: "Концерт",
  FESTIVAL: "Фестиваль",
  CLUB_SHOW: "Клубное шоу",
  LIVESTREAM: "Livestream",
  SHOWCASE: "Showcase",
  MEETUP: "Meetup",
  OTHER: "Другое"
};

const ageRestrictionLabels: Record<EventAgeRestriction, string> = {
  ALL_AGES: "0+",
  AGE_6: "6+",
  AGE_12: "12+",
  AGE_16: "16+",
  AGE_18: "18+",
  AGE_21: "21+"
};

export const eventArtistInputSchema = z.object({
  id: z.string().uuid().optional(),
  artistUserId: z.string().uuid().nullable().optional(),
  displayName: z.string().trim().min(1, "Укажите имя артиста."),
  photoUrl: z.string().trim().url("Некорректный URL фото.").nullable().optional().or(z.literal("")),
  role: z.enum(["HEADLINER", "ARTIST", "DJ", "MC", "GUEST", "HOST", "SPECIAL_GUEST"]).default("ARTIST"),
  performanceTime: z.string().trim().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  bio: z.string().trim().max(2000).nullable().optional(),
  socialLinks: z.record(z.string()).optional()
});

export const eventImageInputSchema = z.object({
  id: z.string().uuid().optional(),
  imageUrl: z.string().trim().url("Некорректный URL изображения."),
  altText: z.string().trim().max(160).nullable().optional(),
  kind: z.string().trim().min(1).default("gallery"),
  isCover: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0)
});

export const eventTicketTypeInputSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["REGULAR", "EARLY_BIRD", "VIP", "BACKSTAGE", "GUEST_LIST", "FREE"]).default("REGULAR"),
  name: z.string().trim().min(1, "Укажите название билета."),
  description: z.string().trim().max(2000).nullable().optional(),
  price: z.coerce.number().min(0, "Цена не может быть отрицательной."),
  currency: z.string().trim().min(3).max(8).default(DEFAULT_CURRENCY),
  quantityTotal: z.coerce.number().int().min(0, "Количество не может быть отрицательным."),
  perUserLimit: z.coerce.number().int().min(1).max(100).default(10),
  salesStartAt: z.string().trim().datetime().nullable().optional().or(z.literal("")),
  salesEndAt: z.string().trim().datetime().nullable().optional().or(z.literal("")),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0)
});

export const eventFormSchema = z.object({
  title: z.string().trim().min(3, "Укажите название события."),
  slug: z.string().trim().optional(),
  eventType: z.enum(["CONCERT", "FESTIVAL", "CLUB_SHOW", "LIVESTREAM", "SHOWCASE", "MEETUP", "OTHER"]).default("CONCERT"),
  ageRestriction: z.enum(["ALL_AGES", "AGE_6", "AGE_12", "AGE_16", "AGE_18", "AGE_21"]).default("ALL_AGES"),
  description: z.string().trim().max(10000).nullable().optional(),
  hashtags: z.array(z.string().trim().min(1)).default([]),
  genres: z.array(z.string().trim().min(1)).default([]),
  startsAt: z.string().trim().datetime("Укажите корректную дату начала."),
  endsAt: z.string().trim().datetime().nullable().optional().or(z.literal("")),
  city: z.string().trim().min(1, "Укажите город."),
  venueName: z.string().trim().min(1, "Укажите площадку."),
  address: z.string().trim().min(1, "Укажите адрес."),
  country: z.string().trim().nullable().optional(),
  placeId: z.string().trim().nullable().optional(),
  mapProvider: z.string().trim().nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  coverImageUrl: z.string().trim().url("Некорректный URL обложки.").nullable().optional().or(z.literal("")),
  posterImageUrl: z.string().trim().url("Некорректный URL афиши.").nullable().optional().or(z.literal("")),
  currency: z.string().trim().min(3).max(8).default(DEFAULT_CURRENCY),
  ticketSalesEnabled: z.boolean().default(true),
  ticketTerms: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["DRAFT", "PENDING_MODERATION", "PUBLISHED", "SOLD_OUT", "CANCELLED", "FINISHED", "HIDDEN"]).default("DRAFT"),
  moderationNote: z.string().trim().max(3000).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  artists: z.array(eventArtistInputSchema).default([]),
  images: z.array(eventImageInputSchema).default([]),
  ticketTypes: z.array(eventTicketTypeInputSchema).default([]),
  metadata: z.record(z.any()).optional()
});

export const createTicketOrderSchema = z.object({
  ticketTypeId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(20),
  buyerEmail: z.string().trim().email("Укажите корректный email."),
  buyerName: z.string().trim().max(160).optional().or(z.literal("")),
  buyerPhone: z.string().trim().min(5).max(40).optional().or(z.literal(""))
});

export const checkInTicketSchema = z.object({
  ticketCode: z.string().trim().min(6, "Укажите ticket code."),
  gateName: z.string().trim().max(120).optional().or(z.literal("")),
  method: z.string().trim().min(1).max(40).default("qr"),
  notes: z.string().trim().max(1000).optional().or(z.literal(""))
});

type EventClient = typeof prisma;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
  );
}

function toDate(value?: string | null) {
  const raw = cleanString(value);
  return raw ? new Date(raw) : null;
}

function toDecimal(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return new Prisma.Decimal(value);
}

function slugify(input: string) {
  const base = input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return base.slice(0, 80) || "event";
}

async function ensureUniqueEventSlug(client: EventClient, title: string, preferred?: string, excludeId?: string) {
  const base = slugify(preferred || title);
  let candidate = base;
  let index = 1;
  while (true) {
    const existing = await client.events.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {})
      },
      select: { id: true }
    });
    if (!existing) return candidate;
    index += 1;
    candidate = `${base}-${index}`;
  }
}

function getEventCommissionPercent() {
  const raw = Number(process.env.EVENTS_PLATFORM_COMMISSION_PERCENT ?? "0");
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

function calculateCommission(totalAmount: number) {
  const percent = getEventCommissionPercent();
  const gross = new Prisma.Decimal(totalAmount);
  const commission = gross.mul(percent).div(100).toDecimalPlaces(2);
  const net = gross.sub(commission).toDecimalPlaces(2);
  return { percent, gross, commission, net };
}

function mapArtistRow(artist: {
  id: string;
  artist_user_id: string | null;
  display_name: string;
  photo_url: string | null;
  role: EventArtistRole;
  performance_time: string | null;
  sort_order: number;
  metadata: Prisma.JsonValue | null;
}) {
  const metadata = asRecord(artist.metadata);
  return {
    id: artist.id,
    artistUserId: artist.artist_user_id,
    displayName: artist.display_name,
    photoUrl: artist.photo_url,
    role: artist.role,
    roleLabel: artistRoleLabels[artist.role],
    performanceTime: artist.performance_time,
    sortOrder: artist.sort_order,
    bio: typeof metadata?.bio === "string" ? metadata.bio : "",
    socialLinks: toStringRecord(metadata?.socialLinks)
  };
}

function mapImageRow(image: {
  id: string;
  image_url: string;
  alt_text: string | null;
  kind: string;
  is_cover: boolean;
  sort_order: number;
}) {
  return {
    id: image.id,
    imageUrl: image.image_url,
    altText: image.alt_text ?? "",
    kind: image.kind,
    isCover: image.is_cover,
    sortOrder: image.sort_order
  };
}

function mapTicketTypeRow(ticketType: {
  id: string;
  kind: EventTicketTypeKind;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  currency: string;
  quantity_total: number;
  quantity_sold: number;
  per_user_limit: number;
  sales_start_at: Date | null;
  sales_end_at: Date | null;
  enabled: boolean;
  sort_order: number;
}) {
  return {
    id: ticketType.id,
    kind: ticketType.kind,
    kindLabel: ticketKindLabels[ticketType.kind],
    name: ticketType.name,
    description: ticketType.description,
    price: Number(ticketType.price),
    currency: ticketType.currency,
    quantityTotal: ticketType.quantity_total,
    quantitySold: ticketType.quantity_sold,
    remaining: Math.max(0, ticketType.quantity_total - ticketType.quantity_sold),
    perUserLimit: ticketType.per_user_limit,
    salesStartAt: ticketType.sales_start_at?.toISOString() ?? "",
    salesEndAt: ticketType.sales_end_at?.toISOString() ?? "",
    enabled: ticketType.enabled,
    sortOrder: ticketType.sort_order
  };
}

function mapOrderStatus(status: EventPaymentStatus) {
  switch (status) {
    case "PENDING_PAYMENT":
      return "Ожидает оплату";
    case "PREPARING":
      return "Готовится";
    case "COMPLETED":
      return "Оплачен";
    case "FAILED":
      return "Ошибка";
    case "REFUNDED":
      return "Возврат";
    case "CANCELLED":
      return "Отменён";
    default:
      return status;
  }
}

export async function getEventsByOrganizer(userId: string, client: EventClient = prisma) {
  try {
    const events = await client.events.findMany({
      where: { organizer_user_id: userId },
      orderBy: [{ starts_at: "desc" }, { created_at: "desc" }],
      include: {
        ticket_types: {
          orderBy: [{ sort_order: "asc" }, { created_at: "asc" }]
        },
        orders: {
          where: { status: "COMPLETED" },
          select: { id: true, quantity: true, total_amount: true }
        },
        artists: {
          orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
          select: { id: true, display_name: true, role: true }
        }
      }
    });

    return events.map((event) => {
      const soldTickets = event.ticket_types.reduce((sum, item) => sum + item.quantity_sold, 0);
      const totalTickets = event.ticket_types.reduce((sum, item) => sum + item.quantity_total, 0);
      const grossRevenue = event.orders.reduce((sum, item) => sum + Number(item.total_amount), 0);
      return {
        id: event.id,
        title: event.title,
        slug: event.slug,
        status: event.status,
        statusLabel: eventStatusLabels[event.status],
        city: event.city ?? "",
        venueName: event.venue_name ?? "",
        startsAt: event.starts_at.toISOString(),
        endsAt: event.ends_at?.toISOString() ?? "",
        eventType: event.event_type,
        eventTypeLabel: eventTypeLabels[event.event_type],
        coverImageUrl: event.cover_image_url,
        ticketSalesEnabled: event.ticket_sales_enabled,
        ticketTypesCount: event.ticket_types.length,
        soldTickets,
        totalTickets,
        remainingTickets: Math.max(0, totalTickets - soldTickets),
        grossRevenue,
        artistSummary: event.artists.map((artist) => artist.display_name).slice(0, 4)
      };
    });
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, [...EVENT_FOUNDATION_TABLES])) {
      return [];
    }
    throw error;
  }
}

export async function getEventOwnerView(eventId: string, userId: string, client: EventClient = prisma) {
  const event = await client.events.findFirst({
    where: { id: eventId, organizer_user_id: userId },
    include: {
      venue: true,
      tags: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
      artists: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
      images: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
      ticket_types: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
      orders: {
        orderBy: { created_at: "desc" },
        take: 20,
        include: {
          ticket_type: true,
          tickets: true
        }
      },
      checkins: {
        orderBy: { created_at: "desc" },
        take: 20,
        include: { ticket: true }
      },
      financial_transactions: {
        orderBy: { created_at: "desc" },
        take: 20
      }
    }
  });

  if (!event) return null;

  const ticketTypes = event.ticket_types.map(mapTicketTypeRow);
  const financialSummary = event.financial_transactions.reduce(
    (acc, item) => {
      const net = Number(item.net_amount);
      const gross = Number(item.gross_amount);
      const commission = Number(item.commission_amount);
      acc.gross += gross;
      acc.commission += commission;
      acc.net += item.direction === "CREDIT" ? net : -net;
      return acc;
    },
    { gross: 0, commission: 0, net: 0 }
  );

  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    eventType: event.event_type,
    eventTypeLabel: eventTypeLabels[event.event_type],
    ageRestriction: event.age_restriction,
    ageRestrictionLabel: ageRestrictionLabels[event.age_restriction],
    description: event.description ?? "",
    hashtags: event.hashtags,
    genres: event.genres,
    startsAt: event.starts_at.toISOString(),
    endsAt: event.ends_at?.toISOString() ?? "",
    city: event.city ?? "",
    venueName: event.venue_name ?? "",
    address: event.address ?? "",
    coverImageUrl: event.cover_image_url ?? "",
    posterImageUrl: event.poster_image_url ?? "",
    currency: event.currency,
    ticketSalesEnabled: event.ticket_sales_enabled,
    ticketTerms: event.ticket_terms ?? "",
    status: event.status,
    statusLabel: eventStatusLabels[event.status],
    moderationNote: event.moderation_note ?? "",
    tags: event.tags.map((tag) => tag.value),
    artists: event.artists.map(mapArtistRow),
    images: event.images.map(mapImageRow),
    ticketTypes,
    venue: {
      id: event.venue?.id ?? "",
      name: event.venue?.name ?? event.venue_name ?? "",
      city: event.venue?.city ?? event.city ?? "",
      address: event.venue?.address ?? event.address ?? "",
      placeId: event.venue?.place_id ?? "",
      mapProvider: event.venue?.map_provider ?? "",
      latitude:
        typeof event.venue?.latitude?.toNumber === "function" ? event.venue.latitude.toNumber() : null,
      longitude:
        typeof event.venue?.longitude?.toNumber === "function" ? event.venue.longitude.toNumber() : null
    },
    orders: event.orders.map((order) => ({
      id: order.id,
      buyerEmail: order.buyer_email,
      buyerPhone: order.buyer_phone,
      quantity: order.quantity,
      totalAmount: Number(order.total_amount),
      currency: order.currency,
      status: order.status,
      statusLabel: mapOrderStatus(order.status),
      createdAt: order.created_at.toISOString(),
      ticketTypeName: order.ticket_type.name,
      tickets: order.tickets.map((ticket) => ({
        id: ticket.id,
        ticketCode: ticket.ticket_code,
        status: ticket.status,
        statusLabel: ticketStatusLabels[ticket.status]
      }))
    })),
    checkins: event.checkins.map((checkin) => ({
      id: checkin.id,
      ticketCode: checkin.ticket.ticket_code,
      method: checkin.method,
      gateName: checkin.gate_name ?? "",
      notes: checkin.notes ?? "",
      createdAt: checkin.created_at.toISOString()
    })),
    finance: {
      gross: financialSummary.gross,
      commission: financialSummary.commission,
      net: financialSummary.net
    }
  };
}

export async function getEventPublicView(slug: string, client: EventClient = prisma) {
  const event = await client.events.findFirst({
    where: { slug, status: { in: ["PUBLISHED", "SOLD_OUT", "FINISHED"] } },
    include: {
      venue: true,
      tags: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
      artists: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
      images: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
      ticket_types: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] }
    }
  });

  if (!event) return null;

  const ticketTypes = event.ticket_types.map(mapTicketTypeRow);
  const totalRemaining = ticketTypes.reduce((sum, item) => sum + item.remaining, 0);
  const activeTicketTypes = ticketTypes.filter((item) => item.enabled);
  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    description: event.description ?? "",
    city: event.city ?? "",
    venueName: event.venue_name ?? "",
    address: event.address ?? "",
    coverImageUrl: event.cover_image_url ?? "",
    posterImageUrl: event.poster_image_url ?? "",
    startsAt: event.starts_at.toISOString(),
    endsAt: event.ends_at?.toISOString() ?? "",
    status: event.status,
    statusLabel: eventStatusLabels[event.status],
    eventTypeLabel: eventTypeLabels[event.event_type],
    ageRestrictionLabel: ageRestrictionLabels[event.age_restriction],
    hashtags: event.hashtags,
    genres: event.genres,
    ticketSalesEnabled: event.ticket_sales_enabled,
    ticketTerms: event.ticket_terms ?? "",
    tags: event.tags.map((tag) => tag.value),
    artists: event.artists.map(mapArtistRow),
    images: event.images.map(mapImageRow),
    ticketTypes: activeTicketTypes,
    totalRemaining,
    venue: {
      mapProvider: event.venue?.map_provider ?? "",
      placeId: event.venue?.place_id ?? "",
      latitude:
        typeof event.venue?.latitude?.toNumber === "function" ? event.venue.latitude.toNumber() : null,
      longitude:
        typeof event.venue?.longitude?.toNumber === "function" ? event.venue.longitude.toNumber() : null
    }
  };
}

export async function upsertEvent(params: {
  userId: string;
  eventId?: string;
  input: z.infer<typeof eventFormSchema>;
  client?: EventClient;
}) {
  const client = params.client ?? prisma;
  const parsed = eventFormSchema.parse(params.input);
  const eventId = params.eventId;

  if (eventId) {
    const existing = await client.events.findFirst({
      where: { id: eventId, organizer_user_id: params.userId },
      select: { id: true, slug: true, venue_id: true }
    });
    if (!existing) {
      throw new Error("Событие не найдено.");
    }
  }

  const slug = await ensureUniqueEventSlug(client, parsed.title, parsed.slug, eventId);
  const startsAt = new Date(parsed.startsAt);
  const endsAt = toDate(parsed.endsAt);
  if (endsAt && endsAt < startsAt) {
    throw new Error("Дата окончания не может быть раньше даты начала.");
  }

  return client.$transaction(async (tx) => {
    let venueId: string | null = null;
    if (parsed.venueName || parsed.address) {
      const venue = await tx.venues.create({
        data: {
          owner_user_id: params.userId,
          name: parsed.venueName,
          city: cleanString(parsed.city),
          address: cleanString(parsed.address),
          place_id: cleanString(parsed.placeId),
          map_provider: cleanString(parsed.mapProvider),
          latitude: toDecimal(parsed.latitude ?? null),
          longitude: toDecimal(parsed.longitude ?? null),
          metadata: {
            country: cleanString(parsed.country)
          }
        }
      });
      venueId = venue.id;
    }

    const eventCreateData: Prisma.eventsUncheckedCreateInput = {
      organizer_user_id: params.userId,
      venue_id: venueId,
      title: parsed.title,
      slug,
      event_type: parsed.eventType,
      age_restriction: parsed.ageRestriction,
      description: cleanString(parsed.description),
      city: parsed.city,
      venue_name: parsed.venueName,
      address: parsed.address,
      hashtags: parsed.hashtags,
      genres: parsed.genres,
      starts_at: startsAt,
      ends_at: endsAt,
      cover_image_url: cleanString(parsed.coverImageUrl),
      poster_image_url: cleanString(parsed.posterImageUrl),
      currency: parsed.currency,
      ticket_sales_enabled: parsed.ticketSalesEnabled,
      ticket_terms: cleanString(parsed.ticketTerms),
      status: parsed.status,
      moderation_note: cleanString(parsed.moderationNote),
      published_at: parsed.status === "PUBLISHED" ? new Date() : null,
      metadata: {
        ...(parsed.metadata ?? {}),
        country: cleanString(parsed.country)
      }
    };

    const eventUpdateData: Prisma.eventsUncheckedUpdateInput = {
      venue_id: venueId,
      title: parsed.title,
      slug,
      event_type: parsed.eventType,
      age_restriction: parsed.ageRestriction,
      description: cleanString(parsed.description),
      city: parsed.city,
      venue_name: parsed.venueName,
      address: parsed.address,
      hashtags: parsed.hashtags,
      genres: parsed.genres,
      starts_at: startsAt,
      ends_at: endsAt,
      cover_image_url: cleanString(parsed.coverImageUrl),
      poster_image_url: cleanString(parsed.posterImageUrl),
      currency: parsed.currency,
      ticket_sales_enabled: parsed.ticketSalesEnabled,
      ticket_terms: cleanString(parsed.ticketTerms),
      status: parsed.status,
      moderation_note: cleanString(parsed.moderationNote),
      published_at: parsed.status === "PUBLISHED" ? new Date() : null,
      metadata: {
        ...(parsed.metadata ?? {}),
        country: cleanString(parsed.country)
      }
    };

    const event = eventId
      ? await tx.events.update({
          where: { id: eventId },
          data: eventUpdateData
        })
      : await tx.events.create({
          data: eventCreateData
        });

    await Promise.all([
      tx.event_tags.deleteMany({ where: { event_id: event.id } }),
      tx.event_artists.deleteMany({ where: { event_id: event.id } }),
      tx.event_images.deleteMany({ where: { event_id: event.id } }),
      tx.event_ticket_types.deleteMany({ where: { event_id: event.id } })
    ]);

    if (parsed.tags.length) {
      await tx.event_tags.createMany({
        data: parsed.tags.map((value, index) => ({
          event_id: event.id,
          value,
          sort_order: index
        }))
      });
    }

    if (parsed.artists.length) {
      await tx.event_artists.createMany({
        data: parsed.artists.map((artist, index) => ({
          event_id: event.id,
          artist_user_id: artist.artistUserId ?? null,
          display_name: artist.displayName,
          photo_url: cleanString(artist.photoUrl),
          role: artist.role,
          performance_time: cleanString(artist.performanceTime),
          sort_order: artist.sortOrder ?? index,
          metadata: {
            bio: cleanString(artist.bio),
            socialLinks: artist.socialLinks ?? {}
          }
        }))
      });
    }

    if (parsed.images.length) {
      await tx.event_images.createMany({
        data: parsed.images.map((image, index) => ({
          event_id: event.id,
          image_url: image.imageUrl,
          alt_text: cleanString(image.altText),
          kind: image.kind,
          is_cover: image.isCover,
          sort_order: image.sortOrder ?? index
        }))
      });
    }

    if (parsed.ticketTypes.length) {
      await tx.event_ticket_types.createMany({
        data: parsed.ticketTypes.map((ticketType, index) => ({
          event_id: event.id,
          kind: ticketType.kind,
          name: ticketType.name,
          description: cleanString(ticketType.description),
          price: new Prisma.Decimal(ticketType.price),
          currency: ticketType.currency || parsed.currency,
          quantity_total: ticketType.quantityTotal,
          quantity_sold: 0,
          per_user_limit: ticketType.perUserLimit,
          sales_start_at: toDate(ticketType.salesStartAt),
          sales_end_at: toDate(ticketType.salesEndAt),
          enabled: ticketType.enabled,
          sort_order: ticketType.sortOrder ?? index
        }))
      });
    }

    return event.id;
  });
}

export async function createTicketOrder(params: {
  eventId: string;
  buyerUserId?: string | null;
  payload: z.infer<typeof createTicketOrderSchema>;
  requestOrigin?: string;
  client?: EventClient;
}) {
  const parsed = createTicketOrderSchema.parse(params.payload);
  return createEventTicketOrder({
    eventId: params.eventId,
    buyerUserId: params.buyerUserId ?? null,
    payload: parsed,
    requestOrigin: params.requestOrigin,
    client: params.client ?? prisma
  });
}

export async function checkInTicket(params: {
  eventId: string;
  actorUserId: string;
  payload: z.infer<typeof checkInTicketSchema>;
  client?: EventClient;
}) {
  const parsed = checkInTicketSchema.parse(params.payload);
  return confirmEventTicketCheckIn({
    eventId: params.eventId,
    organizerUserId: params.actorUserId,
    ticketReference: parsed.ticketCode,
    gateName: parsed.gateName,
    method: parsed.method,
    notes: parsed.notes,
    client: params.client ?? prisma
  });
}

export async function getEventVenueSuggestions(query: string, userId: string, client: EventClient = prisma) {
  const clean = query.trim();
  if (!clean) return [];

  try {
    const venues = await client.venues.findMany({
      where: {
        owner_user_id: userId,
        OR: [
          { name: { contains: clean, mode: "insensitive" } },
          { city: { contains: clean, mode: "insensitive" } },
          { address: { contains: clean, mode: "insensitive" } }
        ]
      },
      orderBy: { updated_at: "desc" },
      take: 12
    });
    return venues.map((venue) => ({
      id: venue.id,
      name: venue.name,
      city: venue.city ?? "",
      address: venue.address ?? "",
      placeId: venue.place_id ?? "",
      mapProvider: venue.map_provider ?? "",
      latitude: typeof venue.latitude?.toNumber === "function" ? venue.latitude.toNumber() : null,
      longitude: typeof venue.longitude?.toNumber === "function" ? venue.longitude.toNumber() : null
    }));
  } catch (error) {
    if (isPrismaTableMissingError(error, "venues")) {
      return [];
    }
    throw error;
  }
}

export async function getEventTicketsByBuyer(userId: string, client: EventClient = prisma) {
  try {
    const tickets = await client.event_tickets.findMany({
      where: { buyer_user_id: userId },
      orderBy: { created_at: "desc" },
      include: {
        event: true,
        ticket_type: true
      }
    });
    return tickets.map((ticket) => ({
      id: ticket.id,
      ticketCode: ticket.ticket_code,
      publicToken: ticket.public_token ?? "",
      checkUrl: ticket.public_token ? buildTicketCheckUrl(ticket.public_token) : "",
      status: ticket.status,
      statusLabel: ticketStatusLabels[ticket.status],
      buyerEmail: ticket.buyer_email ?? "",
      eventId: ticket.event_id,
      eventTitle: ticket.event.title,
      eventSlug: ticket.event.slug,
      ticketTypeName: ticket.ticket_type.name,
      purchaseAt: ticket.purchase_at?.toISOString() ?? ticket.created_at.toISOString(),
      usedAt: ticket.used_at?.toISOString() ?? ""
    }));
  } catch (error) {
    if (isPrismaTableMissingError(error, "event_tickets")) {
      return [];
    }
    throw error;
  }
}
