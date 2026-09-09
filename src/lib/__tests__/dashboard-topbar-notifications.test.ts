import assert from "node:assert/strict";
import test from "node:test";

import {
  optimisticallyMarkNotificationRead,
  restoreOptimisticNotificationRead
} from "@/components/layout/dashboard-topbar";
import type { DashboardNotificationsResponse } from "@/lib/api/contracts";

const notifications: DashboardNotificationsResponse = {
  unreadCount: 27,
  items: [
    {
      id: "notification_1",
      kind: "support_reply",
      title: "Reply",
      message: "Support replied",
      href: "/dashboard/support",
      createdAt: "2026-08-11T10:00:00.000Z",
      isUnread: true
    }
  ]
};

test("individual optimistic notification read can be rolled back after a failed request", () => {
  const optimistic = optimisticallyMarkNotificationRead(notifications, "notification_1");

  assert.equal(optimistic.unreadCount, 26);
  assert.equal(optimistic.items[0]?.isUnread, false);

  const restored = restoreOptimisticNotificationRead(optimistic, "notification_1");
  assert.equal(restored.unreadCount, 27);
  assert.equal(restored.items[0]?.isUnread, true);
});

test("individual optimistic notification rollback is idempotent", () => {
  const restored = restoreOptimisticNotificationRead(notifications, "notification_1");

  assert.equal(restored, notifications);
});
