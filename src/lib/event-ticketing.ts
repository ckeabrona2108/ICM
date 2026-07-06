import { createHash, randomBytes, randomUUID } from "node:crypto";

import { EventTicketStatus, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { sendEventTicketsPaidEmail } from "@/lib/user-event-email";
import { createYooKassaPayment } from "@/lib/yookassa";

const DEFAULT_CURRENCY = "RUB";
const DEFAULT_PUBLIC_BASE_URL = "https://icecreammusic.net";
const DEFAULT_STAFF_LINK_TTL_HOURS = 18;

type RootClient = typeof prisma;
type DbClient = typeof prisma | Prisma.TransactionClient;

type OrderPaymentStatus = "payment_pending" | "paid" | "payment_failed" | "cancelled" | "refunded";
type TicketCheckResult = "valid" | "already_used" | "invalid" | "not_found";
type CheckinMode = "manual_confirm" | "auto_check_in";
type CheckMode = "public" | "organizer" | "staff";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function cleanString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return asRecord(value) as unknown as Prisma.InputJsonValue;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function generateOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function buildOrderNumber(date = new Date()) {
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return `ICM-${stamp}-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function buildTicketCode() {
  return `ICM-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

function getPublicBaseUrl(requestOrigin?: string) {
  const configured =
    process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_DOMAIN?.trim() || DEFAULT_PUBLIC_BASE_URL;
  const base = requestOrigin?.trim() || configured;
  return base.replace(/\/+$/u, "");
}

export function buildTicketCheckUrl(publicToken: string, requestOrigin?: string) {
  return `${getPublicBaseUrl(requestOrigin)}/ticket/check/${encodeURIComponent(publicToken)}`;
}

export function buildTicketQrImageUrl(checkUrl: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(checkUrl)}`;
}

function getOrderPaymentStatusLabel(status: OrderPaymentStatus) {
  switch (status) {
    case "paid":
      return "Paid";
    case "payment_failed":
      return "Payment Failed";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
    default:
      return "Payment Pending";
  }
}

function getTicketStatusLabel(status: EventTicketStatus) {
  switch (status) {
    case "RESERVED":
      return "Reserved";
    case "PAID":
      return "Paid";
    case "USED":
      return "Used";
    case "CANCELLED":
      return "Cancelled";
    case "REFUNDED":
      return "Refunded";
    case "EXPIRED":
      return "Expired";
    default:
      return "Available";
  }
}

function getPublicCheckLabel(result: TicketCheckResult) {
  switch (result) {
    case "valid":
      return "Билет действителен";
    case "already_used":
      return "Билет уже использован";
    case "invalid":
      return "Билет недействителен";
    default:
      return "Билет не найден";
  }
}

function getCheckinMode(metadata: Prisma.JsonValue | null | undefined): CheckinMode {
  const value = asRecord(metadata).checkinMode;
  return value === "auto_check_in" ? "auto_check_in" : "manual_confirm";
}

function isYooKassaConfigured() {
  return Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim());
}

function parseTicketReference(value: string) {
  const raw = value.trim();
  if (!raw) return { ticketCode: null, publicToken: null };

  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/ticket\/check\/([^/]+)$/u);
    if (match) {
      return { ticketCode: null, publicToken: decodeURIComponent(match[1]) };
    }
  } catch {}

  if (raw.startsWith("ICM-")) {
    return { ticketCode: raw.toUpperCase(), publicToken: null };
  }

  return { ticketCode: null, publicToken: raw };
}

function getRequestMeta(meta?: { ip?: string | null; userAgent?: string | null }) {
  return {
    scannerIp: cleanString(meta?.ip),
    userAgent: cleanString(meta?.userAgent)
  };
}

async function logTicketCheck(params: {
  tx: DbClient;
  eventId: string;
  ticketId?: string | null;
  checkMode: CheckMode;
  result: TicketCheckResult;
  staffAccessId?: string | null;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
}) {
  const meta = getRequestMeta(params.requestMeta);
  await params.tx.ticket_check_logs.create({
    data: {
      event_id: params.eventId,
      ticket_id: params.ticketId ?? null,
      check_mode: params.checkMode,
      result: params.result,
      staff_access_id: params.staffAccessId ?? null,
      scanner_ip: meta.scannerIp,
      user_agent: meta.userAgent
    }
  });
}

async function validateCheckinAccess(params: {
  tx: DbClient;
  eventId: string;
  organizerUserId?: string | null;
  staffToken?: string | null;
}) {
  if (params.organizerUserId) {
    const event = await params.tx.events.findFirst({
      where: { id: params.eventId, organizer_user_id: params.organizerUserId },
      select: {
        id: true,
        title: true,
        venue_name: true,
        address: true,
        starts_at: true,
        metadata: true
      }
    });
    if (event) {
      return { type: "organizer" as const, staffAccessId: null, event };
    }
  }

  const staffToken = cleanString(params.staffToken);
  if (!staffToken) {
    throw new Error("Недействительный staff access token.");
  }

  const access = await params.tx.staff_access_tokens.findFirst({
    where: {
      event_id: params.eventId,
      token_hash: hashToken(staffToken),
      revoked_at: null,
      expires_at: { gt: new Date() }
    },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          venue_name: true,
          address: true,
          starts_at: true,
          metadata: true
        }
      }
    }
  });

  if (!access) {
    throw new Error("Staff access token не найден или истёк.");
  }

  await params.tx.staff_access_tokens.update({
    where: { id: access.id },
    data: { last_used_at: new Date() }
  });

  return {
    type: "staff" as const,
    staffAccessId: access.id,
    event: access.event
  };
}

function resolvePublicCheckResult(status: EventTicketStatus): TicketCheckResult {
  if (status === "PAID") return "valid";
  if (status === "USED") return "already_used";
  if (status === "CANCELLED" || status === "REFUNDED" || status === "EXPIRED") return "invalid";
  return "invalid";
}

async function releaseReservedTicketsForOrder(tx: DbClient, orderId: string) {
  const reservedTickets = await tx.event_tickets.findMany({
    where: { order_id: orderId, status: "RESERVED" },
    select: { id: true, ticket_type_id: true }
  });

  if (!reservedTickets.length) return;

  await tx.event_tickets.updateMany({
    where: { order_id: orderId, status: "RESERVED" },
    data: { status: "CANCELLED", cancelled_at: new Date() }
  });

  const decrements = new Map<string, number>();
  for (const ticket of reservedTickets) {
    decrements.set(ticket.ticket_type_id, (decrements.get(ticket.ticket_type_id) ?? 0) + 1);
  }

  await Promise.all(
    Array.from(decrements.entries()).map(([ticketTypeId, count]) =>
      tx.event_ticket_types.update({
        where: { id: ticketTypeId },
        data: {
          quantity_sold: {
            decrement: count
          }
        }
      })
    )
  );
}

async function queueOrSendPaidTicketEmail(params: {
  client?: RootClient;
  orderId: string;
  requestOrigin?: string;
}) {
  const client = params.client ?? prisma;

  const order = await client.ticket_orders.findUnique({
    where: { id: params.orderId },
    include: {
      event: true,
      tickets: {
        include: {
          ticket_type: true
        },
        orderBy: { created_at: "asc" }
      }
    }
  });

  if (!order || order.status !== "COMPLETED") return;
  if (order.email_delivery_status && order.email_delivery_status !== "failed") return;

  const claimed = await client.ticket_orders.updateMany({
    where: {
      id: order.id,
      email_sent_at: null,
      OR: [{ email_delivery_status: null }, { email_delivery_status: "failed" }]
    },
    data: {
      email_delivery_status: "sending"
    }
  });

  if (claimed.count === 0) return;

  try {
    const emailResult = await sendEventTicketsPaidEmail({
      to: order.buyer_email,
      buyerName: order.buyer_name,
      eventTitle: order.event.title,
      eventDate: order.event.starts_at.toISOString(),
      venueName: order.event.venue_name ?? "",
      venueAddress: order.event.address ?? "",
      orderNumber: order.order_number ?? order.id,
      paymentStatusLabel: getOrderPaymentStatusLabel("paid"),
      tickets: order.tickets
        .filter((ticket) => ticket.public_token)
        .map((ticket) => {
          const checkUrl = buildTicketCheckUrl(ticket.public_token as string, params.requestOrigin);
          return {
            ticketTypeName: ticket.ticket_type.name,
            ticketCode: ticket.ticket_code,
            checkUrl,
            qrImageUrl: buildTicketQrImageUrl(checkUrl)
          };
        })
    });

    await client.ticket_orders.update({
      where: { id: order.id },
      data: {
        email_sent_at: emailResult.ok ? new Date() : null,
        email_delivery_status: emailResult.ok ? "sent" : "failed",
        provider_message_id: emailResult.providerMessageId
      }
    });
  } catch (error) {
    await client.ticket_orders.update({
      where: { id: order.id },
      data: {
        email_delivery_status: "failed"
      }
    });
    console.error("[event-ticket-email] failed", { orderId: order.id, error });
  }
}

export async function createEventTicketOrder(params: {
  eventId: string;
  buyerUserId?: string | null;
  payload: {
    ticketTypeId: string;
    quantity: number;
    buyerEmail: string;
    buyerName?: string;
    buyerPhone?: string;
  };
  requestOrigin?: string;
  client?: RootClient;
}) {
  const client = params.client ?? prisma;
  const now = new Date();

  const reservation = await client.$transaction(async (tx) => {
    const ticketType = await tx.event_ticket_types.findFirst({
      where: {
        id: params.payload.ticketTypeId,
        event_id: params.eventId,
        enabled: true
      },
      include: {
        event: true
      }
    });

    if (!ticketType) {
      throw new Error("Тип билета не найден.");
    }
    if (!ticketType.event.ticket_sales_enabled) {
      throw new Error("Продажа билетов отключена.");
    }
    if (!ticketType.event.slug) {
      throw new Error("Событие не готово к продаже билетов.");
    }
    if (!['PUBLISHED', 'SOLD_OUT'].includes(ticketType.event.status)) {
      throw new Error("Покупка доступна только для опубликованных событий.");
    }

    const remaining = Math.max(0, ticketType.quantity_total - ticketType.quantity_sold);
    if (remaining < params.payload.quantity) {
      throw new Error("Недостаточно доступных билетов.");
    }
    if (params.payload.quantity > ticketType.per_user_limit) {
      throw new Error(`Лимит на одного покупателя: ${ticketType.per_user_limit}.`);
    }

    if (ticketType.sales_start_at && ticketType.sales_start_at > now) {
      throw new Error("Продажи ещё не начались.");
    }
    if (ticketType.sales_end_at && ticketType.sales_end_at < now) {
      throw new Error("Продажи уже завершены.");
    }

    const totalAmount = Number(ticketType.price) * params.payload.quantity;
    const orderNumber = buildOrderNumber(now);

    const order = await tx.ticket_orders.create({
      data: {
        event_id: params.eventId,
        ticket_type_id: ticketType.id,
        buyer_user_id: params.buyerUserId ?? null,
        order_number: orderNumber,
        status: "PENDING_PAYMENT",
        buyer_email: params.payload.buyerEmail,
        buyer_name: cleanString(params.payload.buyerName),
        buyer_phone: cleanString(params.payload.buyerPhone),
        quantity: params.payload.quantity,
        total_amount: new Prisma.Decimal(totalAmount),
        currency: ticketType.currency || DEFAULT_CURRENCY,
        metadata: {
          source: "events_ticketing",
          lifecycleStatus: "payment_pending"
        }
      }
    });

    const payment = await tx.ticket_payments.create({
      data: {
        order_id: order.id,
        event_id: params.eventId,
        amount: new Prisma.Decimal(totalAmount),
        currency: ticketType.currency || DEFAULT_CURRENCY,
        status: "PENDING_PAYMENT",
        raw_payload: {
          source: "events_ticketing"
        }
      }
    });

    const tickets = await Promise.all(
      Array.from({ length: params.payload.quantity }).map(() =>
        tx.event_tickets.create({
          data: {
            event_id: params.eventId,
            ticket_type_id: ticketType.id,
            order_id: order.id,
            buyer_user_id: params.buyerUserId ?? null,
            ticket_code: buildTicketCode(),
            qr_payload: "",
            status: "RESERVED",
            holder_name: cleanString(params.payload.buyerName),
            buyer_email: params.payload.buyerEmail,
            buyer_phone: cleanString(params.payload.buyerPhone),
            metadata: {
              source: "events_ticketing"
            }
          }
        })
      )
    );

    await tx.event_ticket_types.update({
      where: { id: ticketType.id },
      data: {
        quantity_sold: {
          increment: params.payload.quantity
        }
      }
    });

    return { order, payment, tickets, ticketType, totalAmount };
  });

  if (!isYooKassaConfigured() || reservation.totalAmount <= 0) {
    const confirmation = await confirmEventTicketOrderPayment({
      orderId: reservation.order.id,
      providerPaymentId: reservation.payment.provider_payment_id ?? null,
      status: "succeeded",
      rawPayload: { mode: "offline_auto_confirm" },
      requestOrigin: params.requestOrigin,
      client
    });

    return {
      orderId: reservation.order.id,
      orderNumber: reservation.order.order_number,
      paymentId: reservation.payment.id,
      totalAmount: reservation.totalAmount,
      currency: reservation.order.currency,
      status: "paid" as const,
      confirmationUrl: null,
      tickets: confirmation.tickets
    };
  }

  try {
    const payment = await createYooKassaPayment({
      amountRub: reservation.totalAmount,
      description: `${reservation.ticketType.event.title} · ${reservation.ticketType.name} × ${params.payload.quantity}`,
      returnUrl: `${getPublicBaseUrl(params.requestOrigin)}/events/${reservation.ticketType.event.slug}?order=${reservation.order.id}`,
      customerEmail: params.payload.buyerEmail,
      idempotenceKey: reservation.order.id,
      metadata: {
        orderId: reservation.order.id,
        purpose: "event_ticket_order",
        eventId: params.eventId
      }
    });

    await client.ticket_orders.update({
      where: { id: reservation.order.id },
      data: {
        payment_provider: "yookassa",
        payment_reference: payment.providerPaymentId,
        metadata: {
          source: "events_ticketing",
          lifecycleStatus: "payment_pending"
        }
      }
    });

    await client.ticket_payments.update({
      where: { id: reservation.payment.id },
      data: {
        provider: "yookassa",
        provider_payment_id: payment.providerPaymentId,
        raw_payload: {
          source: "events_ticketing",
          confirmationUrl: payment.confirmationUrl ?? null,
          expiresAt: payment.expiresAt ?? null
        }
      }
    });

    return {
      orderId: reservation.order.id,
      orderNumber: reservation.order.order_number,
      paymentId: reservation.payment.id,
      totalAmount: reservation.totalAmount,
      currency: reservation.order.currency,
      status: "payment_pending" as const,
      confirmationUrl: payment.confirmationUrl ?? null,
      tickets: reservation.tickets.map((ticket) => ({
        ticketId: ticket.id,
        ticketCode: ticket.ticket_code,
        status: "reserved",
        statusLabel: getTicketStatusLabel("RESERVED")
      }))
    };
  } catch (error) {
    await client.$transaction(async (tx) => {
      await tx.ticket_orders.update({
        where: { id: reservation.order.id },
        data: {
          status: "FAILED",
          metadata: {
            source: "events_ticketing",
            lifecycleStatus: "payment_failed"
          }
        }
      });
      await tx.ticket_payments.update({
        where: { id: reservation.payment.id },
        data: {
          status: "FAILED",
          raw_payload: {
            source: "events_ticketing",
            error: error instanceof Error ? error.message : "payment_create_failed"
          }
        }
      });
      await releaseReservedTicketsForOrder(tx as DbClient, reservation.order.id);
    });
    throw error;
  }
}

export async function confirmEventTicketOrderPayment(params: {
  orderId?: string;
  providerPaymentId?: string | null;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  rawPayload?: unknown;
  requestOrigin?: string;
  client?: RootClient;
}) {
  const client = params.client ?? prisma;

  const existing = await client.ticket_orders.findFirst({
    where: {
      OR: [
        params.orderId ? { id: params.orderId } : undefined,
        params.providerPaymentId ? { payment_reference: params.providerPaymentId } : undefined
      ].filter(Boolean) as Prisma.ticket_ordersWhereInput[]
    },
    include: {
      event: true,
      ticket_type: true,
      tickets: {
        include: {
          ticket_type: true
        },
        orderBy: { created_at: "asc" }
      },
      payments: {
        orderBy: { created_at: "desc" },
        take: 1
      }
    }
  });

  if (!existing) {
    return { ok: false, status: "not_found" as const, error: "Ticket order not found" };
  }

  if (params.status === "pending" || params.status === "waiting_for_capture") {
    return { ok: true, status: "payment_pending" as const, applied: false, orderId: existing.id };
  }

  if (params.status === "canceled") {
    await client.$transaction(async (tx) => {
      await tx.ticket_orders.update({
        where: { id: existing.id },
        data: {
          status: "FAILED",
          metadata: {
            source: "events_ticketing",
            lifecycleStatus: "payment_failed"
          }
        }
      });
      if (existing.payments[0]) {
        await tx.ticket_payments.update({
          where: { id: existing.payments[0].id },
          data: {
            status: "FAILED",
            raw_payload: toJsonValue(params.rawPayload)
          }
        });
      }
      await releaseReservedTicketsForOrder(tx as DbClient, existing.id);
    });

    return { ok: true, status: "payment_failed" as const, applied: true, orderId: existing.id };
  }

  if (existing.status === "COMPLETED") {
    await queueOrSendPaidTicketEmail({ client, orderId: existing.id, requestOrigin: params.requestOrigin });
    return {
      ok: true,
      status: "paid" as const,
      applied: false,
      orderId: existing.id,
      tickets: existing.tickets.map((ticket) => ({
        ticketId: ticket.id,
        ticketCode: ticket.ticket_code,
        publicToken: ticket.public_token,
        checkUrl: ticket.public_token ? buildTicketCheckUrl(ticket.public_token, params.requestOrigin) : null,
        status: "paid",
        statusLabel: getTicketStatusLabel("PAID")
      }))
    };
  }

  const result = await client.$transaction(async (tx) => {
    const order = await tx.ticket_orders.findUnique({
      where: { id: existing.id },
      include: {
        event: true,
        ticket_type: true,
        tickets: {
          include: { ticket_type: true },
          orderBy: { created_at: "asc" }
        },
        payments: {
          orderBy: { created_at: "desc" },
          take: 1
        },
        financials: {
          orderBy: { created_at: "desc" },
          take: 1
        }
      }
    });
    if (!order) {
      throw new Error("Ticket order not found");
    }

    const paidAt = new Date();
    const tickets = [] as Array<{
      ticketId: string;
      ticketCode: string;
      publicToken: string;
      checkUrl: string;
      status: "paid";
      statusLabel: string;
    }>;

    for (const ticket of order.tickets) {
      const publicToken = ticket.public_token ?? generateOpaqueToken();
      const checkUrl = buildTicketCheckUrl(publicToken, params.requestOrigin);
      await tx.event_tickets.update({
        where: { id: ticket.id },
        data: {
          status: "PAID",
          public_token: publicToken,
          qr_payload: checkUrl,
          purchase_at: paidAt,
          metadata: {
            ...asRecord(ticket.metadata),
            publicCheckUrl: checkUrl
          } as Prisma.InputJsonValue
        }
      });
      tickets.push({
        ticketId: ticket.id,
        ticketCode: ticket.ticket_code,
        publicToken,
        checkUrl,
        status: "paid",
        statusLabel: getTicketStatusLabel("PAID")
      });
    }

    await tx.ticket_orders.update({
      where: { id: order.id },
      data: {
        status: "COMPLETED",
        paid_at: paidAt,
        completed_at: paidAt,
        metadata: {
          source: "events_ticketing",
          lifecycleStatus: "paid"
        }
      }
    });

    if (order.payments[0]) {
      await tx.ticket_payments.update({
        where: { id: order.payments[0].id },
        data: {
          status: "COMPLETED",
          confirmed_at: paidAt,
          provider_payment_id: params.providerPaymentId ?? order.payments[0].provider_payment_id,
          raw_payload: toJsonValue(params.rawPayload)
        }
      });
    }

    if (!order.financials.length) {
      const gross = Number(order.total_amount);
      const commission = new Prisma.Decimal(gross).mul(10).div(100).toDecimalPlaces(2);
      const net = new Prisma.Decimal(gross).sub(commission).toDecimalPlaces(2);
      await tx.event_financial_transactions.create({
        data: {
          event_id: order.event_id,
          organizer_user_id: order.event.organizer_user_id,
          order_id: order.id,
          payment_id: order.payments[0]?.id ?? null,
          direction: "CREDIT",
          gross_amount: new Prisma.Decimal(gross),
          commission_amount: commission,
          net_amount: net,
          currency: order.currency,
          description: `Продажа билетов: ${order.ticket_type.name}`,
          metadata: {
            quantity: order.quantity,
            buyerEmail: order.buyer_email,
            orderNumber: order.order_number
          }
        }
      });
    }

    if (!order.email_delivery_status) {
      await tx.ticket_orders.update({
        where: { id: order.id },
        data: { email_delivery_status: "queued" }
      });
    }

    return { orderId: order.id, tickets };
  });

  await queueOrSendPaidTicketEmail({ client, orderId: existing.id, requestOrigin: params.requestOrigin });

  return { ok: true, status: "paid" as const, applied: true, ...result };
}

export async function getPublicTicketCheckView(params: {
  publicToken: string;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
  client?: RootClient;
}) {
  const client = params.client ?? prisma;
  const publicToken = cleanString(params.publicToken);
  if (!publicToken) {
    return {
      result: "not_found" as const,
      label: getPublicCheckLabel("not_found"),
      ticket: null
    };
  }

  const ticket = await client.event_tickets.findFirst({
    where: { public_token: publicToken },
    include: {
      event: true,
      ticket_type: true,
      order: true
    }
  });

  if (!ticket) {
    return {
      result: "not_found" as const,
      label: getPublicCheckLabel("not_found"),
      ticket: null
    };
  }

  const result = resolvePublicCheckResult(ticket.status);
  await logTicketCheck({
    tx: client,
    eventId: ticket.event_id,
    ticketId: ticket.id,
    checkMode: "public",
    result,
    requestMeta: params.requestMeta
  });

  return {
    result,
    label: getPublicCheckLabel(result),
    ticket: {
      eventTitle: ticket.event.title,
      eventDate: ticket.event.starts_at.toISOString(),
      ticketTypeName: ticket.ticket_type.name,
      paymentStatusLabel: ticket.status === "PAID" || ticket.status === "USED" ? "Paid" : getTicketStatusLabel(ticket.status),
      orderNumberMasked: ticket.order?.order_number ? `${ticket.order.order_number.slice(0, 8)}•••` : null,
      checkedInAt: ticket.checked_in_at?.toISOString() ?? ticket.used_at?.toISOString() ?? null,
      status: ticket.status,
      statusLabel: getTicketStatusLabel(ticket.status)
    }
  };
}

export async function createStaffAccessLink(params: {
  eventId: string;
  actorUserId: string;
  label?: string;
  expiresInHours?: number;
  requestOrigin?: string;
  client?: RootClient;
}) {
  const client = params.client ?? prisma;
  const event = await client.events.findFirst({
    where: { id: params.eventId, organizer_user_id: params.actorUserId },
    select: { id: true }
  });
  if (!event) {
    throw new Error("Событие не найдено.");
  }

  const plainToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + (params.expiresInHours ?? DEFAULT_STAFF_LINK_TTL_HOURS) * 60 * 60 * 1000);

  const access = await client.staff_access_tokens.create({
    data: {
      event_id: params.eventId,
      token_hash: hashToken(plainToken),
      label: cleanString(params.label),
      role: "staff",
      expires_at: expiresAt,
      created_by_user_id: params.actorUserId
    }
  });

  return {
    id: access.id,
    token: plainToken,
    expiresAt: expiresAt.toISOString(),
    url: `${getPublicBaseUrl(params.requestOrigin)}/event/${params.eventId}/checkin?access=${encodeURIComponent(plainToken)}`
  };
}

export async function getEventCheckinView(params: {
  eventId: string;
  organizerUserId?: string | null;
  staffToken?: string | null;
  client?: RootClient;
}) {
  const client = params.client ?? prisma;
  return client.$transaction(async (tx) => {
    const access = await validateCheckinAccess({
      tx,
      eventId: params.eventId,
      organizerUserId: params.organizerUserId,
      staffToken: params.staffToken
    });

    const [totals, recent] = await Promise.all([
      tx.event_tickets.groupBy({
        by: ["status"],
        where: { event_id: params.eventId },
        _count: { _all: true }
      }),
      tx.ticket_checkins.findMany({
        where: { event_id: params.eventId },
        include: { ticket: true },
        orderBy: { created_at: "desc" },
        take: 10
      })
    ]);

    const totalTickets = totals.reduce((sum, item) => sum + item._count._all, 0);
    const checkedIn = totals.find((item) => item.status === "USED")?._count._all ?? 0;
    const remaining = totals.find((item) => item.status === "PAID")?._count._all ?? 0;

    return {
      accessType: access.type,
      event: {
        id: access.event.id,
        title: access.event.title,
        venueName: access.event.venue_name ?? "",
        address: access.event.address ?? "",
        startsAt: access.event.starts_at.toISOString(),
        checkinMode: getCheckinMode(access.event.metadata)
      },
      stats: {
        total: totalTickets,
        checkedIn,
        remaining
      },
      recent: recent.map((entry) => ({
        id: entry.id,
        ticketCode: entry.ticket.ticket_code,
        checkedInAt: entry.created_at.toISOString(),
        gateName: entry.gate_name ?? "",
        method: entry.method
      }))
    };
  });
}

export async function previewEventTicketCheck(params: {
  eventId: string;
  ticketReference: string;
  organizerUserId?: string | null;
  staffToken?: string | null;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
  client?: RootClient;
}) {
  const client = params.client ?? prisma;
  return client.$transaction(async (tx) => {
    const access = await validateCheckinAccess({
      tx,
      eventId: params.eventId,
      organizerUserId: params.organizerUserId,
      staffToken: params.staffToken
    });

    const ref = parseTicketReference(params.ticketReference);
    const ticket = await tx.event_tickets.findFirst({
      where: {
        event_id: params.eventId,
        OR: [
          ref.ticketCode ? { ticket_code: ref.ticketCode } : undefined,
          ref.publicToken ? { public_token: ref.publicToken } : undefined
        ].filter(Boolean) as Prisma.event_ticketsWhereInput[]
      },
      include: {
        order: true,
        ticket_type: true,
        event: true
      }
    });

    if (!ticket) {
      await logTicketCheck({
        tx,
        eventId: params.eventId,
        checkMode: access.type === "organizer" ? "organizer" : "staff",
        result: "not_found",
        staffAccessId: access.staffAccessId,
        requestMeta: params.requestMeta
      });
      return {
        result: "not_found" as const,
        label: "❌ Билет не найден",
        ticket: null,
        canMarkUsed: false
      };
    }

    const result = resolvePublicCheckResult(ticket.status);
    await logTicketCheck({
      tx,
      eventId: params.eventId,
      ticketId: ticket.id,
      checkMode: access.type === "organizer" ? "organizer" : "staff",
      result,
      staffAccessId: access.staffAccessId,
      requestMeta: params.requestMeta
    });

    return {
      result,
      label:
        result === "valid"
          ? "✅ Билет действителен"
          : result === "already_used"
            ? "⚠️ Билет уже использован"
            : "❌ Билет недействителен",
      ticket: {
        id: ticket.id,
        ticketCode: ticket.ticket_code,
        eventTitle: ticket.event.title,
        ticketTypeName: ticket.ticket_type.name,
        paymentStatusLabel: ticket.status === "PAID" || ticket.status === "USED" ? "Paid" : getTicketStatusLabel(ticket.status),
        orderNumber: ticket.order?.order_number ?? ticket.order_id ?? "",
        checkedInAt: ticket.checked_in_at?.toISOString() ?? ticket.used_at?.toISOString() ?? null,
        status: ticket.status,
        statusLabel: getTicketStatusLabel(ticket.status)
      },
      canMarkUsed: result === "valid",
      accessType: access.type,
      checkinMode: getCheckinMode(access.event.metadata)
    };
  });
}

export async function confirmEventTicketCheckIn(params: {
  eventId: string;
  ticketReference: string;
  organizerUserId?: string | null;
  staffToken?: string | null;
  gateName?: string;
  method?: string;
  notes?: string;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
  client?: RootClient;
}) {
  const client = params.client ?? prisma;
  return client.$transaction(async (tx) => {
    const access = await validateCheckinAccess({
      tx,
      eventId: params.eventId,
      organizerUserId: params.organizerUserId,
      staffToken: params.staffToken
    });

    const ref = parseTicketReference(params.ticketReference);
    const ticket = await tx.event_tickets.findFirst({
      where: {
        event_id: params.eventId,
        OR: [
          ref.ticketCode ? { ticket_code: ref.ticketCode } : undefined,
          ref.publicToken ? { public_token: ref.publicToken } : undefined
        ].filter(Boolean) as Prisma.event_ticketsWhereInput[]
      }
    });

    if (!ticket) {
      throw new Error("Билет не найден.");
    }

    const updated = await tx.event_tickets.updateMany({
      where: { id: ticket.id, status: "PAID" },
      data: {
        status: "USED",
        checked_in_at: new Date(),
        checked_in_by_type: access.type,
        checked_in_by_id: access.staffAccessId ?? params.organizerUserId ?? null,
        used_at: new Date()
      }
    });

    if (updated.count !== 1) {
      throw new Error("Билет уже использован или больше невалиден.");
    }

    const refreshed = await tx.event_tickets.findUnique({
      where: { id: ticket.id },
      select: { id: true, ticket_code: true, checked_in_at: true }
    });

    if (access.type === "organizer" && params.organizerUserId) {
      await tx.ticket_checkins.create({
        data: {
          event_id: params.eventId,
          ticket_id: ticket.id,
          checked_in_by_user_id: params.organizerUserId,
          method: cleanString(params.method) ?? "qr",
          gate_name: cleanString(params.gateName),
          notes: cleanString(params.notes)
        }
      });
    }

    await logTicketCheck({
      tx,
      eventId: params.eventId,
      ticketId: ticket.id,
      checkMode: access.type === "organizer" ? "organizer" : "staff",
      result: "valid",
      staffAccessId: access.staffAccessId,
      requestMeta: params.requestMeta
    });

    return {
      checkinId: refreshed?.id ?? ticket.id,
      ticketCode: ticket.ticket_code,
      status: "used" as const,
      statusLabel: getTicketStatusLabel("USED"),
      checkedInAt: refreshed?.checked_in_at?.toISOString() ?? new Date().toISOString()
    };
  });
}

export async function buildEventGuestListWorkbook(params: {
  eventId: string;
  actorUserId: string;
  requestOrigin?: string;
  client?: RootClient;
}) {
  const client = params.client ?? prisma;
  const event = await client.events.findFirst({
    where: { id: params.eventId, organizer_user_id: params.actorUserId },
    include: {
      tickets: {
        include: {
          order: true,
          ticket_type: true
        },
        orderBy: [{ purchase_at: "asc" }, { created_at: "asc" }]
      }
    }
  });

  if (!event) {
    throw new Error("Событие не найдено.");
  }

  const rows = event.tickets.map((ticket) => ({
    order_number: ticket.order?.order_number ?? ticket.order_id ?? "",
    ticket_id: ticket.id,
    ticket_code: ticket.ticket_code,
    buyer_name: ticket.order?.buyer_name ?? ticket.holder_name ?? "",
    buyer_email: ticket.buyer_email ?? ticket.order?.buyer_email ?? "",
    ticket_type: ticket.ticket_type.name,
    payment_status: ticket.status === "PAID" || ticket.status === "USED" ? "Paid" : getTicketStatusLabel(ticket.status),
    usage_status: getTicketStatusLabel(ticket.status),
    purchased_at: ticket.purchase_at?.toISOString() ?? ticket.created_at.toISOString(),
    qr_payload: ticket.qr_payload,
    public_check_url: ticket.public_token ? buildTicketCheckUrl(ticket.public_token, params.requestOrigin) : ""
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Guest List");
  return {
    eventTitle: event.title,
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
  };
}
export const __eventTicketingTestUtils = {
  parseTicketReference,
  resolvePublicCheckResult
};
