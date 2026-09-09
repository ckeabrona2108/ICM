import assert from "node:assert/strict";
import test from "node:test";

import { retryPendingSocialNotifications } from "@/lib/social-notification-outbox";

test("retry worker claims a failed event and marks it delivered without resetting read state", async () => {
  const updates: Array<Record<string, unknown>> = [];
  let retryWhere: Record<string, unknown> | null = null;
  let notificationUpsert: Record<string, unknown> | null = null;
  const prisma = {
    social_notification_outbox: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        retryWhere = where;
        return [{ event_id: "social-event-1" }];
      },
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => ({
        id: "a0000000-0000-4000-8000-000000000001",
        event_id: "social-event-1",
        user_id: "b0000000-0000-4000-8000-000000000002",
        kind: "artist_post_commented",
        title: "Новый комментарий",
        message: "Сообщение",
        href: "/feed/post_a0000000-0000-4000-8000-000000000003",
        source_type: "post",
        source_id: "a0000000-0000-4000-8000-000000000003",
        send_push: false,
        attempt_count: 1
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return {};
      }
    },
    ai_user_notifications: {
      upsert: async (args: Record<string, unknown>) => {
        notificationUpsert = args;
        return {};
      }
    }
  } as never;

  const delivered = await retryPendingSocialNotifications(prisma, 10);

  assert.equal(delivered, 1);
  assert.equal(updates.at(-1)?.status, "delivered");
  const update = (notificationUpsert as { update?: Record<string, unknown> } | null)?.update;
  assert.equal(update?.read_at, undefined);
  assert.equal(update?.source_type, "post");
  assert.deepEqual(
    (retryWhere as { OR?: Array<{ status?: unknown }> } | null)?.OR?.map((item) => item.status),
    [{ in: ["pending", "failed"] }, "processing"]
  );
});
