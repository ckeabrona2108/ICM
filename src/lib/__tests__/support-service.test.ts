/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import {
  addUserSupportMessage,
  addAdminSupportReply,
  createSupportTicket,
  getUserSupportTicket,
  getUserUnreadSupportTicketCount,
  SupportAccessError
} from "@/lib/support-service";

function makeTicketDetails(overrides?: Partial<{
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: "OPEN" | "IN_PROGRESS" | "WAITING_USER" | "CLOSED";
  title: string;
}>) {
  const id = overrides?.id ?? "ticket_1";
  const userId = overrides?.userId ?? "user_1";
  const userName = overrides?.userName ?? "User";
  const userEmail = overrides?.userEmail ?? "user@example.com";
  const status = overrides?.status ?? "OPEN";
  const title = overrides?.title ?? "Тема";
  const now = new Date("2026-04-29T12:00:00.000Z");

  return {
    id,
    userId,
    title,
    description: "Описание",
    status,
    priority: "normal",
    adminComment: null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    user: {
      id: userId,
      name: userName,
      email: userEmail
    },
    messages: [
      {
        id: "msg_1",
        ticketId: id,
        direction: "INBOUND",
        body: "Первое сообщение",
        createdAt: now
      }
    ]
  };
}

test("createSupportTicket sends telegram notification after successful save", async () => {
  const notifyCalls: Array<{ ticketId: string; subject: string }> = [];
  const details = makeTicketDetails();

  const prisma = {
    $transaction: async (handler: (tx: any) => Promise<any>) => {
      return handler({
        supportTicket: {
          create: async () => ({
            id: details.id,
            title: details.title,
            createdAt: details.createdAt
          })
        },
        message: {
          create: async () => ({ id: "msg_1" })
        }
      });
    },
    supportTicket: {
      findUnique: async () => details
    }
  } as any;

  const created = await createSupportTicket({
    prisma,
    userId: "user_1",
    userName: "Вячеслав",
    userEmail: "mail@example.com",
    subject: "Проверка UPC",
    body: "Проверьте формат.",
    notify: async (payload) => {
      notifyCalls.push({ ticketId: payload.ticketId, subject: payload.subject });
      return true;
    }
  });

  assert.equal(created.id, "ticket_1");
  assert.equal(notifyCalls.length, 1);
  assert.equal(notifyCalls[0].ticketId, "ticket_1");
});

test("createSupportTicket does not rollback when telegram notification fails", async () => {
  const details = makeTicketDetails({ id: "ticket_2" });
  let transactionCalled = false;

  const prisma = {
    $transaction: async (handler: (tx: any) => Promise<any>) => {
      transactionCalled = true;
      return handler({
        supportTicket: {
          create: async () => ({
            id: details.id,
            title: details.title,
            createdAt: details.createdAt
          })
        },
        message: {
          create: async () => ({ id: "msg_1" })
        }
      });
    },
    supportTicket: {
      findUnique: async () => details
    }
  } as any;

  const created = await createSupportTicket({
    prisma,
    userId: "user_1",
    userName: "Вячеслав",
    userEmail: "mail@example.com",
    subject: "Проверка UPC",
    body: "Проверьте формат.",
    notify: async () => {
      throw new Error("telegram_down");
    },
    logger: {
      warn: () => undefined,
      error: () => undefined
    }
  });

  assert.equal(transactionCalled, true);
  assert.equal(created.id, "ticket_2");
});

test("getUserSupportTicket forbids access to чужой ticket", async () => {
  let markReadCalled = false;
  const prisma = {
    supportTicket: {
      findUnique: async () => makeTicketDetails({ userId: "other_user" })
    },
    message: {
      updateMany: async () => {
        markReadCalled = true;
        return { count: 1 };
      }
    }
  } as any;

  await assert.rejects(
    async () => {
      await getUserSupportTicket(prisma, "user_1", "ticket_1");
    },
    (error: unknown) => error instanceof SupportAccessError
  );
  assert.equal(markReadCalled, false);
});

test("opening user ticket marks admin replies as read for this user", async () => {
  let updateManyArgs: any = null;
  let findCalls = 0;
  const details = makeTicketDetails({ id: "ticket_1", userId: "user_1" });

  const prisma = {
    supportTicket: {
      findUnique: async () => {
        findCalls += 1;
        return details;
      }
    },
    message: {
      updateMany: async (args: any) => {
        updateManyArgs = args;
        return { count: 2 };
      }
    }
  } as any;

  const ticket = await getUserSupportTicket(prisma, "user_1", "ticket_1");
  assert.equal(ticket.id, "ticket_1");
  assert.equal(findCalls, 2);
  assert.equal(updateManyArgs.where.userId, "user_1");
  assert.equal(updateManyArgs.where.ticketId, "ticket_1");
  assert.equal(updateManyArgs.where.direction, "OUTBOUND");
  assert.equal(updateManyArgs.where.isRead, false);
});

test("unread count counts tickets, not messages", async () => {
  const prisma = {
    message: {
      groupBy: async () => [{ ticketId: "ticket_1" }, { ticketId: "ticket_2" }]
    }
  } as any;

  const count = await getUserUnreadSupportTicketCount(prisma, "user_1");
  assert.equal(count, 2);
});

test("addAdminSupportReply saves outbound message and updates status", async () => {
  let messageDirection: string | null = null;
  let updatedStatus: string | null = null;
  let findUniqueCalls = 0;

  const prisma = {
    supportTicket: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        findUniqueCalls += 1;
        if (where.id === "ticket_1") {
          if (findUniqueCalls === 1) {
            return { id: "ticket_1", userId: "user_1", title: "Тема" };
          }
          return makeTicketDetails({ id: "ticket_1", status: "WAITING_USER" });
        }
        return null;
      },
      update: async ({ data }: { data: { status: string } }) => {
        updatedStatus = data.status;
        return {};
      }
    },
    message: {
      create: async ({ data }: { data: { direction: string } }) => {
        messageDirection = data.direction;
        return { id: "msg_2" };
      }
    },
    adminLog: {
      create: async () => ({ id: "log_1" })
    },
    $transaction: async (items: any[]) => {
      for (const item of items) {
        await item;
      }
      return [];
    }
  } as any;

  const ticket = await addAdminSupportReply({
    prisma,
    adminId: "admin_1",
    ticketId: "ticket_1",
    body: "Ответ пользователю"
  });

  assert.equal(messageDirection, "OUTBOUND");
  assert.equal(updatedStatus, "WAITING_USER");
  assert.equal(ticket.status, "WAITING_USER");
});

test("addUserSupportMessage always saves inbound user message", async () => {
  let direction: string | null = null;
  let status: string | null = null;
  let updateCalled = false;
  let findUniqueCalls = 0;

  const prisma = {
    supportTicket: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        findUniqueCalls += 1;
        if (where.id === "ticket_1") {
          if (findUniqueCalls === 1) {
            return { id: "ticket_1", userId: "user_1", title: "Тема", status: "IN_PROGRESS" };
          }
          return makeTicketDetails({ id: "ticket_1", status: "OPEN" });
        }
        return null;
      },
      update: async ({ data }: { data: { status: string } }) => {
        updateCalled = true;
        status = data.status;
        return {};
      }
    },
    message: {
      create: async ({ data }: { data: { direction: string } }) => {
        direction = data.direction;
        return {};
      },
      updateMany: async () => ({ count: 1 })
    },
    $transaction: async (items: Promise<unknown>[]) => Promise.all(items)
  } as any;

  const ticket = await addUserSupportMessage({
    prisma,
    userId: "user_1",
    ticketId: "ticket_1",
    body: "Нужна помощь"
  });

  assert.equal(direction, "INBOUND");
  assert.equal(updateCalled, false);
  assert.equal(status, null);
  assert.equal(ticket.status, "OPEN");
});

test("addUserSupportMessage moves WAITING_USER to IN_PROGRESS", async () => {
  let status: string | null = null;
  let findUniqueCalls = 0;

  const prisma = {
    supportTicket: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        findUniqueCalls += 1;
        if (where.id === "ticket_1") {
          if (findUniqueCalls === 1) {
            return { id: "ticket_1", userId: "user_1", title: "Тема", status: "WAITING_USER" };
          }
          return makeTicketDetails({ id: "ticket_1", status: "IN_PROGRESS" });
        }
        return null;
      },
      update: async ({ data }: { data: { status: string } }) => {
        status = data.status;
        return {};
      }
    },
    message: {
      create: async () => ({}),
      updateMany: async () => ({ count: 1 })
    },
    $transaction: async (items: Promise<unknown>[]) => Promise.all(items)
  } as any;

  const ticket = await addUserSupportMessage({
    prisma,
    userId: "user_1",
    ticketId: "ticket_1",
    body: "Нужна помощь"
  });

  assert.equal(status, "IN_PROGRESS");
  assert.equal(ticket.status, "IN_PROGRESS");
});
