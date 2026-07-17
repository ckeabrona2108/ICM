// @ts-nocheck
import {
  MessageDirection,
  Prisma,
  SupportTicketStatus,
  type PrismaClient
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  notifyAdminNewSupportTicket,
  type TelegramNewTicketNotificationPayload
} from "@/lib/telegram-notifier";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(3, "Укажите тему тикета.").max(160, "Тема слишком длинная."),
  body: z
    .string()
    .trim()
    .min(3, "Опишите проблему подробнее.")
    .max(6000, "Сообщение слишком длинное.")
});

export const supportMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Введите сообщение.")
    .max(6000, "Сообщение слишком длинное.")
});

export const supportStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_USER", "CLOSED"])
});

export type ApiSupportTicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_USER" | "CLOSED";
export type ApiSupportSenderType = "USER" | "ADMIN";

export interface SupportTicketMessageDto {
  id: string;
  ticketId: string;
  senderType: ApiSupportSenderType;
  body: string;
  createdAt: string;
}

export interface SupportTicketDto {
  id: string;
  subject: string;
  status: ApiSupportTicketStatus;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  messages?: SupportTicketMessageDto[];
}

interface LoggerLike {
  warn: (message: string) => void;
  error: (message: string, error?: unknown) => void;
}

const defaultLogger: LoggerLike = {
  warn: (message: string) => console.warn(message),
  error: (message: string, error?: unknown) => console.error(message, error)
};

const SUPPORT_TICKET_STATUS = SupportTicketStatus ?? {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_USER: "WAITING_USER",
  CLOSED: "CLOSED",
  RESOLVED: "RESOLVED"
};

const MESSAGE_DIRECTION = MessageDirection ?? {
  INBOUND: "INBOUND",
  OUTBOUND: "OUTBOUND"
};

function hasSupportTicketRepo(prisma: PrismaClient): boolean {
  const repo = (prisma as unknown as { supportTicket?: unknown }).supportTicket;
  return Boolean(repo && typeof repo === "object");
}

function hasMessageRepo(prisma: PrismaClient): boolean {
  const repo = (prisma as unknown as { message?: unknown }).message;
  return Boolean(repo && typeof repo === "object");
}

type SupportBackend = "orm" | "legacy";

const supportBackendCache = new WeakMap<PrismaClient, Promise<SupportBackend>>();

function isSupportTablesMissingError(error: unknown): boolean {
  return isAnyPrismaTableMissingError(error, [
    "supportTicket",
    "message",
    "SupportTicket",
    "Message"
  ]);
}

async function detectSupportBackend(prisma: PrismaClient): Promise<SupportBackend> {
  if (!hasSupportTicketRepo(prisma) || !hasMessageRepo(prisma)) {
    throw new SupportStorageUnavailableError();
  }

  try {
    const rows = (await (prisma as any).$queryRawUnsafe(
      `
        SELECT
          EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'icecream'
              AND table_name = 'SupportTicket'
          ) AS "hasOrmSupportTicket",
          EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'icecream'
              AND table_name = 'Message'
          ) AS "hasOrmMessage",
          EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'SupportTicket'
          ) AS "hasLegacySupportTicket",
          EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'Message'
          ) AS "hasLegacyMessage"
      `
    )) as Array<Record<string, unknown>>;

    const row = rows[0] ?? {};
    const hasOrmSupportTicket = row.hasOrmSupportTicket === true;
    const hasOrmMessage = row.hasOrmMessage === true;
    const hasLegacySupportTicket = row.hasLegacySupportTicket === true;
    const hasLegacyMessage = row.hasLegacyMessage === true;

    if (hasOrmSupportTicket && hasOrmMessage) return "orm";
    if (hasLegacySupportTicket && hasLegacyMessage) return "legacy";
  } catch {
    return "orm";
  }

  throw new SupportStorageUnavailableError();
}

async function resolveSupportBackend(prisma: PrismaClient): Promise<SupportBackend> {
  const cached = supportBackendCache.get(prisma);
  if (cached) {
    try {
      return await cached;
    } catch (error) {
      supportBackendCache.delete(prisma);
      throw error;
    }
  }

  const pending = detectSupportBackend(prisma);
  supportBackendCache.set(prisma, pending);
  try {
    return await pending;
  } catch (error) {
    supportBackendCache.delete(prisma);
    throw error;
  }
}

function normalizeLegacyStatus(status: unknown): ApiSupportTicketStatus {
  if (status === "RESOLVED" || status === "CLOSED") return "CLOSED";
  if (status === "WAITING_USER") return "WAITING_USER";
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  return "OPEN";
}

function normalizeLegacySender(direction: unknown): ApiSupportSenderType {
  return direction === "OUTBOUND" ? "ADMIN" : "USER";
}

function mapLegacyListRow(row: Record<string, unknown>): SupportTicketDto {
  return {
    id: String(row.id),
    subject: String(row.subject ?? ""),
    status: normalizeLegacyStatus(row.status),
    userId: String(row.userId ?? ""),
    userName: String(row.userName ?? ""),
    userEmail: String(row.userEmail ?? ""),
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
    lastMessage: typeof row.lastMessage === "string" ? row.lastMessage : undefined
  };
}

function mapLegacyDetailsRows(rows: Array<Record<string, unknown>>): SupportTicketDto {
  if (rows.length === 0) {
    throw new SupportNotFoundError();
  }

  const first = rows[0];
  return {
    ...mapLegacyListRow(first),
    messages: rows
      .filter((row) => row.messageId)
      .map((row) => ({
        id: String(row.messageId),
        ticketId: String(row.messageTicketId ?? first.id),
        senderType: normalizeLegacySender(row.direction),
        body: String(row.messageBody ?? ""),
        createdAt: new Date(String(row.messageCreatedAt)).toISOString()
      }))
  };
}

async function legacyListUserSupportTickets(prisma: PrismaClient, userId: string) {
  const rows = (await (prisma as any).$queryRawUnsafe(
    `
      SELECT
        t.id,
        t.title AS subject,
        t.status::text AS status,
        t."userId" AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        t."createdAt" AS "createdAt",
        t."updatedAt" AS "updatedAt",
        lm.body AS "lastMessage"
      FROM public."SupportTicket" t
      JOIN public."User" u ON u.id = t."userId"
      LEFT JOIN LATERAL (
        SELECT m.body
        FROM public."Message" m
        WHERE m."ticketId" = t.id
        ORDER BY m."createdAt" DESC
        LIMIT 1
      ) lm ON TRUE
      WHERE t."userId" = $1
      ORDER BY t."updatedAt" DESC
    `,
    userId
  )) as Array<Record<string, unknown>>;

  return rows.map(mapLegacyListRow);
}

async function legacyListAdminSupportTickets(prisma: PrismaClient) {
  const rows = (await (prisma as any).$queryRawUnsafe(
    `
      SELECT
        t.id,
        t.title AS subject,
        t.status::text AS status,
        t."userId" AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        t."createdAt" AS "createdAt",
        t."updatedAt" AS "updatedAt",
        lm.body AS "lastMessage"
      FROM public."SupportTicket" t
      JOIN public."User" u ON u.id = t."userId"
      LEFT JOIN LATERAL (
        SELECT m.body
        FROM public."Message" m
        WHERE m."ticketId" = t.id
        ORDER BY m."createdAt" DESC
        LIMIT 1
      ) lm ON TRUE
      ORDER BY t."updatedAt" DESC
    `
  )) as Array<Record<string, unknown>>;

  return rows.map(mapLegacyListRow);
}

async function legacyGetSupportTicketDetails(prisma: PrismaClient, ticketId: string) {
  const rows = (await (prisma as any).$queryRawUnsafe(
    `
      SELECT
        t.id,
        t.title AS subject,
        t.status::text AS status,
        t."userId" AS "userId",
        u.name AS "userName",
        u.email AS "userEmail",
        t."createdAt" AS "createdAt",
        t."updatedAt" AS "updatedAt",
        m.id AS "messageId",
        m."ticketId" AS "messageTicketId",
        m.direction::text AS direction,
        m.body AS "messageBody",
        m."createdAt" AS "messageCreatedAt"
      FROM public."SupportTicket" t
      JOIN public."User" u ON u.id = t."userId"
      LEFT JOIN public."Message" m ON m."ticketId" = t.id
      WHERE t.id = $1
      ORDER BY m."createdAt" ASC NULLS LAST
    `,
    ticketId
  )) as Array<Record<string, unknown>>;

  return mapLegacyDetailsRows(rows);
}

async function legacyGetUserSupportTicket(prisma: PrismaClient, userId: string, ticketId: string) {
  const ticket = await legacyGetSupportTicketDetails(prisma, ticketId);
  if (ticket.userId !== userId) {
    throw new SupportAccessError();
  }

  await legacyMarkUserSupportTicketsRead(prisma, userId);
  return legacyGetSupportTicketDetails(prisma, ticketId);
}

async function legacyCreateSupportTicket(params: {
  prisma: PrismaClient;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  body: string;
  notify?: (payload: TelegramNewTicketNotificationPayload) => Promise<boolean>;
  logger?: LoggerLike;
}) {
  const logger = params.logger ?? defaultLogger;
  const notify = params.notify ?? notifyAdminNewSupportTicket;
  const now = new Date();
  const ticketId = randomUUID();

  await (params.prisma as any).$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(
      `
        INSERT INTO public."SupportTicket"
          (id, "userId", title, description, status, priority, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, $4, $5::public."SupportTicketStatus", $6, $7, $7)
      `,
      ticketId,
      params.userId,
      params.subject.trim(),
      params.body.trim(),
      "OPEN",
      "normal",
      now
    );

    await tx.$executeRawUnsafe(
      `
        INSERT INTO public."Message"
          (id, "userId", "ticketId", subject, body, direction, "isRead", "createdAt")
        VALUES
          ($1, $2, $3, $4, $5, $6::public."MessageDirection", $7, $8)
      `,
      randomUUID(),
      params.userId,
      ticketId,
      params.subject.trim(),
      params.body.trim(),
      "INBOUND",
      false,
      now
    );
  });

  try {
    await notify({
      ticketId,
      subject: params.subject.trim(),
      userName: params.userName,
      userEmail: params.userEmail,
      createdAt: now,
      firstMessage: params.body.trim()
    });
  } catch (error) {
    logger.error("[support] telegram notification failed", error);
  }

  return legacyGetSupportTicketDetails(params.prisma, ticketId);
}

async function legacyMarkUserSupportTicketsRead(prisma: PrismaClient, userId: string): Promise<void> {
  await (prisma as any).$executeRawUnsafe(
    `
      UPDATE public."Message"
      SET "isRead" = TRUE
      WHERE "userId" = $1
        AND direction = $2::public."MessageDirection"
        AND "isRead" = FALSE
        AND "ticketId" IS NOT NULL
    `,
    userId,
    "OUTBOUND"
  );
}

async function legacyAddUserSupportMessage(params: {
  prisma: PrismaClient;
  userId: string;
  ticketId: string;
  body: string;
}) {
  const ticketRows = (await (params.prisma as any).$queryRawUnsafe(
    `
      SELECT id, "userId", title, status::text AS status
      FROM public."SupportTicket"
      WHERE id = $1
      LIMIT 1
    `,
    params.ticketId
  )) as Array<Record<string, unknown>>;

  const ticket = ticketRows[0];
  if (!ticket) throw new SupportNotFoundError();
  if (String(ticket.userId) !== params.userId) throw new SupportAccessError();
  if (normalizeLegacyStatus(ticket.status) === "CLOSED") {
    return legacyGetSupportTicketDetails(params.prisma, params.ticketId);
  }

  const nextStatus = ticket.status === "WAITING_USER" ? "IN_PROGRESS" : null;

  await (params.prisma as any).$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(
      `
        INSERT INTO public."Message"
          (id, "userId", "ticketId", subject, body, direction, "isRead", "createdAt")
        VALUES
          ($1, $2, $3, $4, $5, $6::public."MessageDirection", $7, $8)
      `,
      randomUUID(),
      params.userId,
      params.ticketId,
      String(ticket.title ?? ""),
      params.body.trim(),
      "INBOUND",
      false,
      new Date()
    );

    if (nextStatus) {
      await tx.$executeRawUnsafe(
        `
          UPDATE public."SupportTicket"
          SET status = $2::public."SupportTicketStatus", "updatedAt" = $3
          WHERE id = $1
        `,
        params.ticketId,
        nextStatus,
        new Date()
      );
    }
  });

  return legacyGetSupportTicketDetails(params.prisma, params.ticketId);
}

async function legacyInsertAdminLog(
  prisma: PrismaClient,
  params: { adminId: string; action: string; targetType: string; targetId: string | null; payload: unknown }
) {
  try {
    await (prisma as any).$executeRawUnsafe(
      `
        INSERT INTO public."AdminLog"
          (id, "adminId", action, "targetType", "targetId", payload, "createdAt")
        VALUES
          ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      randomUUID(),
      params.adminId,
      params.action,
      params.targetType,
      params.targetId,
      JSON.stringify(params.payload ?? {}),
      new Date()
    );
  } catch {
    // Legacy admin log is best-effort only.
  }
}

async function legacyAddAdminSupportReply(params: {
  prisma: PrismaClient;
  adminId: string;
  ticketId: string;
  body: string;
}) {
  const ticketRows = (await (params.prisma as any).$queryRawUnsafe(
    `
      SELECT id, "userId", title
      FROM public."SupportTicket"
      WHERE id = $1
      LIMIT 1
    `,
    params.ticketId
  )) as Array<Record<string, unknown>>;

  const ticket = ticketRows[0];
  if (!ticket) throw new SupportNotFoundError();

  await (params.prisma as any).$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(
      `
        INSERT INTO public."Message"
          (id, "userId", "ticketId", subject, body, direction, "isRead", "createdAt")
        VALUES
          ($1, $2, $3, $4, $5, $6::public."MessageDirection", $7, $8)
      `,
      randomUUID(),
      String(ticket.userId),
      params.ticketId,
      String(ticket.title ?? ""),
      params.body.trim(),
      "OUTBOUND",
      false,
      new Date()
    );

    await tx.$executeRawUnsafe(
      `
        UPDATE public."SupportTicket"
        SET status = $2::public."SupportTicketStatus", "updatedAt" = $3
        WHERE id = $1
      `,
      params.ticketId,
      "WAITING_USER",
      new Date()
    );
  });

  await legacyInsertAdminLog(params.prisma, {
    adminId: params.adminId,
    action: "SUPPORT_TICKET_REPLY",
    targetType: "SupportTicket",
    targetId: params.ticketId,
    payload: { preview: params.body.trim().slice(0, 240) }
  });

  return legacyGetSupportTicketDetails(params.prisma, params.ticketId);
}

async function legacyCountUnreadSupportTickets(prisma: PrismaClient, userId: string): Promise<number> {
  const rows = (await (prisma as any).$queryRawUnsafe(
    `
      SELECT COUNT(DISTINCT "ticketId")::int AS count
      FROM public."Message"
      WHERE "userId" = $1
        AND direction = $2::public."MessageDirection"
        AND "isRead" = FALSE
        AND "ticketId" IS NOT NULL
    `,
    userId,
    "OUTBOUND"
  )) as Array<Record<string, unknown>>;

  return Number(rows[0]?.count ?? 0);
}

async function legacyUpdateAdminSupportTicketStatus(params: {
  prisma: PrismaClient;
  adminId: string;
  ticketId: string;
  status: ApiSupportTicketStatus;
}) {
  const existingRows = (await (params.prisma as any).$queryRawUnsafe(
    `
      SELECT id
      FROM public."SupportTicket"
      WHERE id = $1
      LIMIT 1
    `,
    params.ticketId
  )) as Array<Record<string, unknown>>;

  if (!existingRows[0]) {
    throw new SupportNotFoundError();
  }

  await (params.prisma as any).$executeRawUnsafe(
    `
      UPDATE public."SupportTicket"
      SET
        status = $2::public."SupportTicketStatus",
        "updatedAt" = $3,
        "closedAt" = CASE WHEN $2 = 'CLOSED' THEN $3 ELSE NULL END
      WHERE id = $1
    `,
    params.ticketId,
    params.status,
    new Date()
  );

  await legacyInsertAdminLog(params.prisma, {
    adminId: params.adminId,
    action: "SUPPORT_TICKET_STATUS_CHANGED",
    targetType: "SupportTicket",
    targetId: params.ticketId,
    payload: { status: params.status }
  });

  return legacyGetSupportTicketDetails(params.prisma, params.ticketId);
}

const ticketListInclude = {
  User: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  Message: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      body: true
    }
  }
} satisfies Prisma.SupportTicketInclude;

const ticketDetailsInclude = {
  User: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  Message: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      ticketId: true,
      direction: true,
      body: true,
      createdAt: true
    }
  }
} satisfies Prisma.SupportTicketInclude;

type TicketListRecord = Prisma.SupportTicketGetPayload<{
  include: typeof ticketListInclude;
}>;

type TicketDetailsRecord = Prisma.SupportTicketGetPayload<{
  include: typeof ticketDetailsInclude;
}>;

function normalizeStatus(status: SupportTicketStatus): ApiSupportTicketStatus {
  if (status === SUPPORT_TICKET_STATUS.RESOLVED) return "CLOSED";
  if (status === SUPPORT_TICKET_STATUS.CLOSED) return "CLOSED";
  if (status === SUPPORT_TICKET_STATUS.WAITING_USER) return "WAITING_USER";
  if (status === SUPPORT_TICKET_STATUS.IN_PROGRESS) return "IN_PROGRESS";
  return "OPEN";
}

function mapMessageDirection(direction: MessageDirection): ApiSupportSenderType {
  return direction === MESSAGE_DIRECTION.OUTBOUND ? "ADMIN" : "USER";
}

function mapListTicket(record: TicketListRecord): SupportTicketDto {
  const userRecord = (record as TicketListRecord & {
    user?: { id: string; name: string; email: string };
  }).User ?? (record as TicketListRecord & { user?: { id: string; name: string; email: string } }).user;
  const lastMessageRecord =
    (record as TicketListRecord & { Message?: Array<{ body?: string }>; messages?: Array<{ body?: string }> })
      .Message?.[0] ??
    (record as TicketListRecord & { Message?: Array<{ body?: string }>; messages?: Array<{ body?: string }> })
      .messages?.[0];

  return {
    id: record.id,
    subject: record.title,
    status: normalizeStatus(record.status),
    userId: record.userId,
    userName: userRecord?.name ?? "",
    userEmail: userRecord?.email ?? "",
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastMessage: lastMessageRecord?.body
  };
}

function mapDetailsTicket(record: TicketDetailsRecord): SupportTicketDto {
  const messages =
    (record as TicketDetailsRecord & {
      messages?: Array<{
        id: string;
        ticketId?: string | null;
        direction: MessageDirection;
        body: string;
        createdAt: Date;
      }>;
    }).Message ??
    (record as TicketDetailsRecord & {
      messages?: Array<{
        id: string;
        ticketId?: string | null;
        direction: MessageDirection;
        body: string;
        createdAt: Date;
      }>;
    }).messages ??
    [];

  return {
    ...mapListTicket(record),
    messages: messages.map((message) => ({
      id: message.id,
      ticketId: message.ticketId ?? record.id,
      senderType: mapMessageDirection(message.direction),
      body: message.body,
      createdAt: message.createdAt.toISOString()
    }))
  };
}

export class SupportAccessError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "SupportAccessError";
  }
}

export class SupportNotFoundError extends Error {
  constructor(message = "Ticket not found") {
    super(message);
    this.name = "SupportNotFoundError";
  }
}

export class SupportStorageUnavailableError extends Error {
  constructor(message = "Хранилище поддержки недоступно. Проверьте таблицы SupportTicket и Message.") {
    super(message);
    this.name = "SupportStorageUnavailableError";
  }
}

async function notifyUserAboutSupportReply(
  prisma: PrismaClient,
  ticket: Pick<SupportTicketDto, "id" | "userId">,
  body: string
): Promise<void> {
  await deliverUserNotificationSafely(prisma, {
    id: `support-reply-${ticket.id}`,
    userId: ticket.userId,
    kind: "support_reply",
    title: "Новый ответ поддержки",
    message: body.trim().slice(0, 240),
    href: `/dashboard/support?ticket=${ticket.id}`,
    resetReadState: true
  });
}

function supportStorageUnavailable(cause?: unknown): SupportStorageUnavailableError {
  const error = new SupportStorageUnavailableError();
  if (cause !== undefined) {
    (error as Error & { cause?: unknown }).cause = cause;
  }
  return error;
}

export async function createSupportTicket(params: {
  prisma: PrismaClient;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  body: string;
  notify?: (payload: TelegramNewTicketNotificationPayload) => Promise<boolean>;
  logger?: LoggerLike;
}): Promise<SupportTicketDto> {
  const backend = await resolveSupportBackend(params.prisma);

  if (backend === "legacy") {
    return legacyCreateSupportTicket(params);
  }

  const logger = params.logger ?? defaultLogger;
  const notify = params.notify ?? notifyAdminNewSupportTicket;

  try {
    const ticket = await params.prisma.$transaction(async (tx) => {
      const createdTicket = await tx.supportTicket.create({
        data: {
          id: randomUUID(),
          userId: params.userId,
          title: params.subject.trim(),
          description: params.body.trim(),
          status: SUPPORT_TICKET_STATUS.OPEN,
          updatedAt: new Date()
        }
      });

      await tx.message.create({
        data: {
          id: randomUUID(),
          userId: params.userId,
          ticketId: createdTicket.id,
          subject: params.subject.trim(),
          body: params.body.trim(),
          direction: MESSAGE_DIRECTION.INBOUND
        }
      });

      return createdTicket;
    });

    try {
      await notify({
        ticketId: ticket.id,
        subject: ticket.title,
        userName: params.userName,
        userEmail: params.userEmail,
        createdAt: ticket.createdAt,
        firstMessage: params.body.trim()
      });
    } catch (error) {
      logger.error("[support] telegram notification failed", error);
    }

    const withMessages = await params.prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: ticketDetailsInclude
    });

    if (!withMessages) {
      throw new SupportNotFoundError();
    }

    return mapDetailsTicket(withMessages);
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      return await legacyCreateSupportTicket(params);
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}

export async function listUserSupportTickets(prisma: PrismaClient, userId: string) {
  const backend = await resolveSupportBackend(prisma);

  if (backend === "legacy") {
    return legacyListUserSupportTickets(prisma, userId);
  }

  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: ticketListInclude
    });
    return tickets.map(mapListTicket);
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      return await legacyListUserSupportTickets(prisma, userId);
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}

export async function markUserSupportTicketsRead(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  const backend = await resolveSupportBackend(prisma);

  if (backend === "legacy") {
    await legacyMarkUserSupportTicketsRead(prisma, userId);
    return;
  }

  try {
    await prisma.message.updateMany({
      where: {
        userId,
        direction: MESSAGE_DIRECTION.OUTBOUND,
        isRead: false,
        ticketId: {
          not: null
        }
      },
      data: {
        isRead: true
      }
    });
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      await legacyMarkUserSupportTicketsRead(prisma, userId);
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}

export async function getUserSupportTicket(
  prisma: PrismaClient,
  userId: string,
  ticketId: string
) {
  const backend = await resolveSupportBackend(prisma);

  if (backend === "legacy") {
    return legacyGetUserSupportTicket(prisma, userId, ticketId);
  }

  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: ticketDetailsInclude
    });

    if (!ticket) {
      throw new SupportNotFoundError();
    }

    if (ticket.userId !== userId) {
      throw new SupportAccessError();
    }

    await prisma.message.updateMany({
      where: {
        userId,
        ticketId: ticket.id,
        direction: MESSAGE_DIRECTION.OUTBOUND,
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    const freshTicket = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: ticketDetailsInclude
    });

    if (!freshTicket) {
      throw new SupportNotFoundError();
    }

    return mapDetailsTicket(freshTicket);
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      return await legacyGetUserSupportTicket(prisma, userId, ticketId);
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}

export async function addUserSupportMessage(params: {
  prisma: PrismaClient;
  userId: string;
  ticketId: string;
  body: string;
}) {
  const backend = await resolveSupportBackend(params.prisma);

  if (backend === "legacy") {
    return legacyAddUserSupportMessage(params);
  }

  try {
    const ticket = await params.prisma.supportTicket.findUnique({
      where: { id: params.ticketId },
      select: { id: true, userId: true, title: true, status: true }
    });

    if (!ticket) {
      throw new SupportNotFoundError();
    }

    if (ticket.userId !== params.userId) {
      throw new SupportAccessError();
    }

    const nextStatus =
      ticket.status === SUPPORT_TICKET_STATUS.WAITING_USER
        ? SUPPORT_TICKET_STATUS.IN_PROGRESS
        : ticket.status === SUPPORT_TICKET_STATUS.CLOSED || ticket.status === SUPPORT_TICKET_STATUS.RESOLVED
          ? ticket.status
          : null;

    const operations: Prisma.PrismaPromise<unknown>[] = [
      params.prisma.message.create({
        data: {
          id: randomUUID(),
          userId: params.userId,
          ticketId: ticket.id,
          subject: ticket.title,
          body: params.body.trim(),
          direction: MESSAGE_DIRECTION.INBOUND
        }
      })
    ];

    if (nextStatus) {
      operations.push(
        params.prisma.supportTicket.update({
          where: { id: ticket.id },
          data: {
            status: nextStatus,
            updatedAt: new Date()
          }
        })
      );
    }

    await params.prisma.$transaction(operations);
    return getUserSupportTicket(params.prisma, params.userId, ticket.id);
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      return await legacyAddUserSupportMessage(params);
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}

export async function listAdminSupportTickets(prisma: PrismaClient) {
  const backend = await resolveSupportBackend(prisma);

  if (backend === "legacy") {
    return legacyListAdminSupportTickets(prisma);
  }

  try {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { updatedAt: "desc" },
      include: ticketListInclude
    });
    return tickets.map(mapListTicket);
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      return await legacyListAdminSupportTickets(prisma);
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}

export async function getAdminSupportTicket(prisma: PrismaClient, ticketId: string) {
  const backend = await resolveSupportBackend(prisma);

  if (backend === "legacy") {
    return legacyGetSupportTicketDetails(prisma, ticketId);
  }

  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: ticketDetailsInclude
    });

    if (!ticket) {
      throw new SupportNotFoundError();
    }

    return mapDetailsTicket(ticket);
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      return await legacyGetSupportTicketDetails(prisma, ticketId);
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}

export async function addAdminSupportReply(params: {
  prisma: PrismaClient;
  adminId: string;
  ticketId: string;
  body: string;
}) {
  const backend = await resolveSupportBackend(params.prisma);

  if (backend === "legacy") {
    const result = await legacyAddAdminSupportReply(params);
    await notifyUserAboutSupportReply(params.prisma, result, params.body);
    return result;
  }

  try {
    const ticket = await params.prisma.supportTicket.findUnique({
      where: { id: params.ticketId },
      select: { id: true, userId: true, title: true }
    });

    if (!ticket) {
      throw new SupportNotFoundError();
    }

    await params.prisma.$transaction([
      params.prisma.message.create({
        data: {
          id: randomUUID(),
          userId: ticket.userId,
          ticketId: ticket.id,
          subject: ticket.title,
          body: params.body.trim(),
          direction: MESSAGE_DIRECTION.OUTBOUND,
          isRead: false
        }
      }),
      params.prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: SUPPORT_TICKET_STATUS.WAITING_USER,
          updatedAt: new Date()
        }
      }),
      params.prisma.adminLog.create({
        data: {
          id: randomUUID(),
          adminId: params.adminId,
          action: "SUPPORT_TICKET_REPLY",
          targetType: "SupportTicket",
          targetId: ticket.id,
          payload: {
            preview: params.body.trim().slice(0, 240)
          }
        }
      })
    ]);

    await notifyUserAboutSupportReply(params.prisma, ticket, params.body);

    return getAdminSupportTicket(params.prisma, ticket.id);
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      const result = await legacyAddAdminSupportReply(params);
      await notifyUserAboutSupportReply(params.prisma, result, params.body);
      return result;
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}

export async function getUserUnreadSupportTicketCount(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const backend = await resolveSupportBackend(prisma);

  if (backend === "legacy") {
    return legacyCountUnreadSupportTickets(prisma, userId);
  }

  try {
    const unreadByTicket = await prisma.message.groupBy({
      by: ["ticketId"],
      where: {
        userId,
        direction: MESSAGE_DIRECTION.OUTBOUND,
        isRead: false,
        ticketId: {
          not: null
        }
      }
    });

    return unreadByTicket.length;
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      return await legacyCountUnreadSupportTickets(prisma, userId);
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}

export async function updateAdminSupportTicketStatus(params: {
  prisma: PrismaClient;
  adminId: string;
  ticketId: string;
  status: ApiSupportTicketStatus;
}) {
  const backend = await resolveSupportBackend(params.prisma);

  if (backend === "legacy") {
    return legacyUpdateAdminSupportTicketStatus(params);
  }

  try {
    const existing = await params.prisma.supportTicket.findUnique({
      where: { id: params.ticketId },
      select: { id: true }
    });

    if (!existing) {
      throw new SupportNotFoundError();
    }

    const mappedStatus =
      params.status === "OPEN"
        ? SUPPORT_TICKET_STATUS.OPEN
        : params.status === "IN_PROGRESS"
          ? SUPPORT_TICKET_STATUS.IN_PROGRESS
          : params.status === "WAITING_USER"
            ? SUPPORT_TICKET_STATUS.WAITING_USER
            : SUPPORT_TICKET_STATUS.CLOSED;

    await params.prisma.$transaction([
      params.prisma.supportTicket.update({
        where: { id: params.ticketId },
        data: {
          status: mappedStatus,
          closedAt: mappedStatus === SUPPORT_TICKET_STATUS.CLOSED ? new Date() : null
        }
      }),
      params.prisma.adminLog.create({
        data: {
          id: randomUUID(),
          adminId: params.adminId,
          action: "SUPPORT_TICKET_STATUS_CHANGED",
          targetType: "SupportTicket",
          targetId: params.ticketId,
          payload: { status: params.status }
        }
      })
    ]);

    return getAdminSupportTicket(params.prisma, params.ticketId);
  } catch (error) {
    if (!isSupportTablesMissingError(error)) {
      throw error;
    }
    try {
      return await legacyUpdateAdminSupportTicketStatus(params);
    } catch (legacyError) {
      throw supportStorageUnavailable(legacyError);
    }
  }
}
