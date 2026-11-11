/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import {
  addUserSupportMessage,
  addAdminSupportReply,
  createSupportTicket,
  getUserSupportTicket,
  listUserSupportTickets,
  getUserUnreadSupportTicketCount,
  SupportAccessError,
  SupportStorageUnavailableError
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
    message: {},
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
    message: {},
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
  assert.equal(findCalls, 1);
  assert.equal(updateManyArgs.where.userId, "user_1");
  assert.equal(updateManyArgs.where.ticketId, "ticket_1");
  assert.equal(updateManyArgs.where.direction, "OUTBOUND");
  assert.equal(updateManyArgs.where.isRead, false);
});

test("unread count counts tickets, not messages", async () => {
  const prisma = {
    supportTicket: {},
    message: {
      groupBy: async () => [{ ticketId: "ticket_1" }, { ticketId: "ticket_2" }]
    },
    $queryRawUnsafe: async () => [
      {
        hasOrmSupportTicket: true,
        hasOrmMessage: true,
        hasLegacySupportTicket: false,
        hasLegacyMessage: false
      }
    ]
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
    ai_user_notifications: {
      upsert: async () => ({ id: "support-reply-ticket_1" })
    },
    user: {
      findUnique: async () => null
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
      update: async ({ data }: { data: { status?: string | null } }) => {
        updateCalled = true;
        status = data.status ?? null;
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
  assert.equal(updateCalled, true);
  assert.equal(status, null);
  assert.equal(ticket.status, "OPEN");
});

test("addAdminSupportReply tolerates missing admin log storage", async () => {
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
      create: async () => {
        throw new Error("admin log table missing");
      }
    },
    ai_user_notifications: {
      upsert: async () => ({ id: "support-reply-ticket_1" })
    },
    user: {
      findUnique: async () => null
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

test("addUserSupportMessage keeps status null when only updatedAt changes", async () => {
  let status: string | null = "not-called";
  const prisma = {
    supportTicket: {
      findUnique: async () => makeTicketDetails({ id: "ticket_1", status: "OPEN" }),
      update: async ({ data }: { data: { status?: string | null } }) => {
        status = data.status ?? null;
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

function makeReplyPrisma() {
  let findUniqueCalls = 0;
  return {
    supportTicket: {
      findUnique: async () => {
        findUniqueCalls += 1;
        if (findUniqueCalls === 1) {
          return { id: "ticket_1", userId: "user_1", title: "Тема", status: "IN_PROGRESS" };
        }
        return makeTicketDetails({ id: "ticket_1", userName: "Вячеслав", userEmail: "mail@example.com" });
      },
      update: async () => ({})
    },
    message: {
      create: async () => ({}),
      updateMany: async () => ({ count: 1 })
    },
    $transaction: async (items: Promise<unknown>[]) => Promise.all(items)
  } as any;
}

test("addUserSupportMessage sends telegram notification about the user reply", async () => {
  const notifyCalls: any[] = [];

  await addUserSupportMessage({
    prisma: makeReplyPrisma(),
    userId: "user_1",
    ticketId: "ticket_1",
    body: "  Ещё вопрос по релизу  ",
    notify: async (payload) => {
      notifyCalls.push(payload);
      return true;
    }
  });

  assert.deepEqual(notifyCalls, [
    {
      ticketId: "ticket_1",
      subject: "Тема",
      userName: "Вячеслав",
      userEmail: "mail@example.com",
      message: "Ещё вопрос по релизу"
    }
  ]);
});

test("addUserSupportMessage skips telegram notification for admin authors", async () => {
  let notified = false;

  await addUserSupportMessage({
    prisma: makeReplyPrisma(),
    userId: "user_1",
    ticketId: "ticket_1",
    body: "Ответ",
    notifyAdmins: false,
    notify: async () => {
      notified = true;
      return true;
    }
  });

  assert.equal(notified, false);
});

test("addUserSupportMessage saves the reply when telegram notification fails", async () => {
  const errors: string[] = [];

  const ticket = await addUserSupportMessage({
    prisma: makeReplyPrisma(),
    userId: "user_1",
    ticketId: "ticket_1",
    body: "Ответ",
    // Working hours, so the off-hours auto-reply never runs here whatever the real clock says.
    now: new Date("2026-11-11T12:00:00+03:00"),
    notify: async () => {
      throw new Error("telegram_down");
    },
    logger: {
      warn: () => undefined,
      error: (message) => errors.push(message)
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(ticket.id, "ticket_1");
  assert.deepEqual(errors, ["[support] telegram reply notification failed"]);
});

test("support fails explicitly instead of writing a local file when DB repositories are incomplete", async () => {
  const prisma = {
    supportTicket: {}
  } as any;

  await assert.rejects(
    createSupportTicket({
      prisma,
      userId: "user_42",
      userName: "Reload User",
      userEmail: "reload@example.com",
      subject: "Тикет не должен пропасть",
      body: "Проверка сохранения после обновления страницы.",
      notify: async () => true
    }),
    SupportStorageUnavailableError
  );
});

test("listUserSupportTickets falls back to legacy public support tables when icecream table is missing", async () => {
  let queryCalls = 0;
  const prisma = {
    supportTicket: {
      findMany: async () => {
        throw new Error('The table `icecream.SupportTicket` does not exist in the current database.');
      }
    },
    message: {},
    $queryRawUnsafe: async () => {
      queryCalls += 1;
      if (queryCalls === 1) {
        return [
          {
            hasOrmSupportTicket: false,
            hasOrmMessage: false,
            hasLegacySupportTicket: true,
            hasLegacyMessage: true
          }
        ];
      }

      return [
        {
          id: "legacy_ticket_1",
          subject: "Legacy ticket",
          status: "OPEN",
          userId: "user_legacy",
          userName: "Legacy User",
          userEmail: "legacy@example.com",
          createdAt: new Date("2026-07-14T18:00:00.000Z"),
          updatedAt: new Date("2026-07-14T18:05:00.000Z"),
          lastMessage: "Последнее сообщение"
        }
      ];
    }
  } as any;

  const tickets = await listUserSupportTickets(prisma, "user_legacy");

  assert.equal(tickets.length, 1);
  assert.equal(tickets[0]?.id, "legacy_ticket_1");
  assert.equal(tickets[0]?.userEmail, "legacy@example.com");
  assert.equal(tickets[0]?.lastMessage, "Последнее сообщение");
});

function makeAutoReplyPrisma(existingOutboundSince: Date | null = null) {
  const created: any[] = [];
  let findUniqueCalls = 0;
  const prisma = {
    supportTicket: {
      findUnique: async () => {
        findUniqueCalls += 1;
        if (findUniqueCalls === 1) return { id: "ticket_1", userId: "user_1", title: "Тема", status: "OPEN" };
        return makeTicketDetails();
      },
      update: async () => ({})
    },
    message: {
      create: async ({ data }: any) => {
        created.push(data);
        return { ...data, createdAt: data.createdAt ?? new Date() };
      },
      findFirst: async ({ where }: any) =>
        existingOutboundSince && existingOutboundSince >= where.createdAt.gte ? { id: "earlier_reply" } : null,
      updateMany: async () => ({ count: 1 })
    },
    $transaction: async (items: any) =>
      typeof items === "function"
        ? items({
            supportTicket: { create: async () => ({ id: "ticket_1", title: "Тема", createdAt: new Date() }) },
            message: { create: async ({ data }: any) => created.push(data) }
          })
        : Promise.all(items)
  } as any;
  return { prisma, created };
}

const SATURDAY_NOON = new Date("2026-11-14T12:00:00+03:00");
const WEDNESDAY_NOON = new Date("2026-11-11T12:00:00+03:00");
const outbound = (created: any[]) => created.filter((m) => m.direction === "OUTBOUND");

test("a user message on a day off gets one auto-reply about the weekend", async () => {
  const { prisma, created } = makeAutoReplyPrisma();
  await addUserSupportMessage({ prisma, userId: "user_1", ticketId: "ticket_1", body: "Вопрос", notify: async () => true, now: SATURDAY_NOON });
  const replies = outbound(created);
  assert.equal(replies.length, 1);
  assert.match(replies[0].body, /Сегодня выходной/);
  assert.equal(replies[0].isRead, true);
});

test("no auto-reply during working hours", async () => {
  const { prisma, created } = makeAutoReplyPrisma();
  await addUserSupportMessage({ prisma, userId: "user_1", ticketId: "ticket_1", body: "Вопрос", notify: async () => true, now: WEDNESDAY_NOON });
  assert.equal(outbound(created).length, 0);
});

test("no second auto-reply in the same off-hours stretch", async () => {
  // Something outbound (the first auto-reply or a staff answer) already went out on Saturday morning.
  const { prisma, created } = makeAutoReplyPrisma(new Date("2026-11-14T10:00:00+03:00"));
  await addUserSupportMessage({ prisma, userId: "user_1", ticketId: "ticket_1", body: "Ещё", notify: async () => true, now: SATURDAY_NOON });
  assert.equal(outbound(created).length, 0);
});

test("staff writing through the user route never gets an auto-reply", async () => {
  const { prisma, created } = makeAutoReplyPrisma();
  await addUserSupportMessage({ prisma, userId: "user_1", ticketId: "ticket_1", body: "Ответ", notifyAdmins: false, now: SATURDAY_NOON });
  assert.equal(outbound(created).length, 0);
});

test("a new ticket on a day off shows the auto-reply in the chat right away", async () => {
  const { prisma } = makeAutoReplyPrisma();
  const ticket = await createSupportTicket({
    prisma,
    userId: "user_1",
    userName: "User",
    userEmail: "user@example.com",
    subject: "Тема",
    body: "Помогите",
    notify: async () => true,
    now: SATURDAY_NOON
  });
  const messages = ticket.messages ?? [];
  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.senderType, "ADMIN");
  assert.match(messages[1]?.body ?? "", /Сегодня выходной/);
});
