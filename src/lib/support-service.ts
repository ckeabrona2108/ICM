import {
  MessageDirection,
  Prisma,
  SupportTicketStatus,
  type PrismaClient
} from "@prisma/client";
import { z } from "zod";

import {
  notifyAdminNewSupportTicket,
  type TelegramNewTicketNotificationPayload
} from "@/lib/telegram-notifier";

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

const ticketListInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      body: true
    }
  }
} satisfies Prisma.SupportTicketInclude;

const ticketDetailsInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  messages: {
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
  if (status === SupportTicketStatus.RESOLVED) return "CLOSED";
  if (status === SupportTicketStatus.CLOSED) return "CLOSED";
  if (status === SupportTicketStatus.WAITING_USER) return "WAITING_USER";
  if (status === SupportTicketStatus.IN_PROGRESS) return "IN_PROGRESS";
  return "OPEN";
}

function mapMessageDirection(direction: MessageDirection): ApiSupportSenderType {
  return direction === MessageDirection.OUTBOUND ? "ADMIN" : "USER";
}

function mapListTicket(record: TicketListRecord): SupportTicketDto {
  return {
    id: record.id,
    subject: record.title,
    status: normalizeStatus(record.status),
    userId: record.userId,
    userName: record.user.name,
    userEmail: record.user.email,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastMessage: record.messages[0]?.body
  };
}

function mapDetailsTicket(record: TicketDetailsRecord): SupportTicketDto {
  return {
    ...mapListTicket(record),
    messages: record.messages.map((message) => ({
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
  const logger = params.logger ?? defaultLogger;
  const notify = params.notify ?? notifyAdminNewSupportTicket;

  const ticket = await params.prisma.$transaction(async (tx) => {
    const createdTicket = await tx.supportTicket.create({
      data: {
        userId: params.userId,
        title: params.subject.trim(),
        description: params.body.trim(),
        status: SupportTicketStatus.OPEN
      }
    });

    await tx.message.create({
      data: {
        userId: params.userId,
        ticketId: createdTicket.id,
        subject: params.subject.trim(),
        body: params.body.trim(),
        direction: MessageDirection.INBOUND
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
}

export async function listUserSupportTickets(prisma: PrismaClient, userId: string) {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: ticketListInclude
  });
  return tickets.map(mapListTicket);
}

export async function getUserSupportTicket(
  prisma: PrismaClient,
  userId: string,
  ticketId: string
) {
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
      direction: MessageDirection.OUTBOUND,
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
}

export async function addUserSupportMessage(params: {
  prisma: PrismaClient;
  userId: string;
  ticketId: string;
  body: string;
}) {
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
    ticket.status === SupportTicketStatus.WAITING_USER
      ? SupportTicketStatus.IN_PROGRESS
      : ticket.status === SupportTicketStatus.CLOSED || ticket.status === SupportTicketStatus.RESOLVED
        ? ticket.status
        : null;

  const operations: Prisma.PrismaPromise<unknown>[] = [
    params.prisma.message.create({
      data: {
        userId: params.userId,
        ticketId: ticket.id,
        subject: ticket.title,
        body: params.body.trim(),
        direction: MessageDirection.INBOUND
      }
    })
  ];

  // Do not rewrite OPEN on every user reply to avoid duplicate "ticket opened" integrations.
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
}

export async function listAdminSupportTickets(prisma: PrismaClient) {
  const tickets = await prisma.supportTicket.findMany({
    orderBy: { updatedAt: "desc" },
    include: ticketListInclude
  });
  return tickets.map(mapListTicket);
}

export async function getAdminSupportTicket(prisma: PrismaClient, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: ticketDetailsInclude
  });

  if (!ticket) {
    throw new SupportNotFoundError();
  }

  return mapDetailsTicket(ticket);
}

export async function addAdminSupportReply(params: {
  prisma: PrismaClient;
  adminId: string;
  ticketId: string;
  body: string;
}) {
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
        userId: ticket.userId,
        ticketId: ticket.id,
        subject: ticket.title,
        body: params.body.trim(),
        direction: MessageDirection.OUTBOUND,
        isRead: false
      }
    }),
    params.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: SupportTicketStatus.WAITING_USER,
        updatedAt: new Date()
      }
    }),
    params.prisma.adminLog.create({
      data: {
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

  return getAdminSupportTicket(params.prisma, ticket.id);
}

export async function getUserUnreadSupportTicketCount(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const unreadByTicket = await prisma.message.groupBy({
    by: ["ticketId"],
    where: {
      userId,
      direction: MessageDirection.OUTBOUND,
      isRead: false,
      ticketId: {
        not: null
      }
    }
  });

  return unreadByTicket.length;
}

export async function updateAdminSupportTicketStatus(params: {
  prisma: PrismaClient;
  adminId: string;
  ticketId: string;
  status: ApiSupportTicketStatus;
}) {
  const existing = await params.prisma.supportTicket.findUnique({
    where: { id: params.ticketId },
    select: { id: true }
  });

  if (!existing) {
    throw new SupportNotFoundError();
  }

  const mappedStatus =
    params.status === "OPEN"
      ? SupportTicketStatus.OPEN
      : params.status === "IN_PROGRESS"
        ? SupportTicketStatus.IN_PROGRESS
        : params.status === "WAITING_USER"
          ? SupportTicketStatus.WAITING_USER
          : SupportTicketStatus.CLOSED;

  await params.prisma.$transaction([
    params.prisma.supportTicket.update({
      where: { id: params.ticketId },
      data: {
        status: mappedStatus,
        closedAt: mappedStatus === SupportTicketStatus.CLOSED ? new Date() : null
      }
    }),
    params.prisma.adminLog.create({
      data: {
        adminId: params.adminId,
        action: "SUPPORT_TICKET_STATUS_CHANGED",
        targetType: "SupportTicket",
        targetId: params.ticketId,
        payload: { status: params.status }
      }
    })
  ]);

  return getAdminSupportTicket(params.prisma, params.ticketId);
}
