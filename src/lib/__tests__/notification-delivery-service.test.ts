import assert from "node:assert/strict";
import test from "node:test";

import { deliverUserNotification } from "@/lib/notification-delivery-service";

test("notification delivery persists the event and can reset read state", async () => {
  let upsertArgs: Record<string, unknown> | null = null;
  const prisma = {
    ai_user_notifications: {
      upsert: async (args: Record<string, unknown>) => {
        upsertArgs = args;
        return { id: "event-1" };
      }
    }
  } as never;

  await deliverUserNotification(prisma, {
    id: "event-1",
    userId: "00000000-0000-4000-8000-000000000001",
    kind: "report_ready",
    title: "Новый отчёт",
    message: "3 квартал 2026",
    href: "/dashboard/finance",
    sendEmail: false,
    sendPush: false,
    resetReadState: true
  });

  const update = (upsertArgs as { update?: { read_at?: Date | null } } | null)?.update;
  const whereId = (upsertArgs as { where?: { id?: string } } | null)?.where?.id;
  assert.equal(update?.read_at, null);
  assert.match(
    whereId ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
  );
});
