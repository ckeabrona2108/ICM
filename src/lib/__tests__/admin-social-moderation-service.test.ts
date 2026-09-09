import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteAdminSocialPost,
  hideAdminSocialPost,
  restoreAdminSocialPost,
  updateAdminSocialReportStatus
} from "../admin-social-moderation-service";

const postRow = {
  id: "11111111-1111-4111-8111-111111111111",
  content: "moderated post",
  audience: "PUBLIC",
  created_at: new Date("2026-09-05T10:00:00.000Z"),
  updated_at: new Date("2026-09-05T10:01:00.000Z"),
  author: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Author",
    email: "author@example.com",
    avatar: null
  }
};

test("admin hide switches post audience to private and removes feed event", async () => {
  const calls: unknown[] = [];
  const prisma = {
    artist_profile_posts: {
      update: async (args: unknown) => {
        calls.push(args);
        return { ...postRow, audience: "PRIVATE" };
      }
    },
    social_activity_events: {
      deleteMany: async (args: unknown) => {
        calls.push(args);
        return { count: 1 };
      }
    }
  } as never;

  const result = await hideAdminSocialPost(prisma, postRow.id);

  assert.equal(result.hidden, true);
  assert.deepEqual(calls, [
    {
      where: { id: postRow.id },
      data: { audience: "PRIVATE" },
      select: {
        id: true,
        content: true,
        audience: true,
        created_at: true,
        updated_at: true,
        author: { select: { id: true, name: true, email: true, avatar: true } }
      }
    },
    { where: { kind: "POST", source_id: postRow.id } }
  ]);
});

test("admin restore makes post public again", async () => {
  const prisma = {
    artist_profile_posts: {
      update: async (args: { data: { audience: string } }) => ({ ...postRow, audience: args.data.audience })
    }
  } as never;

  const result = await restoreAdminSocialPost(prisma, postRow.id);

  assert.equal(result.hidden, false);
  assert.equal(result.audience, "PUBLIC");
});

test("admin delete removes dependent social records before deleting post", async () => {
  const transaction: unknown[] = [];
  const prisma = {
    artist_profile_post_likes: { deleteMany: (args: unknown) => ({ table: "likes", args }) },
    artist_profile_post_comments: { deleteMany: (args: unknown) => ({ table: "comments", args }) },
    social_activity_events: { deleteMany: (args: unknown) => ({ table: "events", args }) },
    artist_profile_posts: { deleteMany: (args: unknown) => ({ table: "posts", args, count: 1 }) },
    $transaction: async (operations: unknown[]) => {
      transaction.push(...operations);
      return operations;
    }
  } as never;

  const result = await deleteAdminSocialPost(prisma, postRow.id);

  assert.deepEqual(result, { id: postRow.id, deleted: true, existed: true });
  assert.deepEqual(transaction, [
    { table: "likes", args: { where: { post_id: postRow.id } } },
    { table: "comments", args: { where: { post_id: postRow.id } } },
    { table: "events", args: { where: { kind: "POST", source_id: postRow.id } } },
    { table: "posts", args: { where: { id: postRow.id } }, count: 1 }
  ]);
});

test("admin delete is idempotent when post was already removed", async () => {
  const prisma = {
    artist_profile_post_likes: { deleteMany: (args: unknown) => ({ table: "likes", args }) },
    artist_profile_post_comments: { deleteMany: (args: unknown) => ({ table: "comments", args }) },
    social_activity_events: { deleteMany: (args: unknown) => ({ table: "events", args }) },
    artist_profile_posts: { deleteMany: (args: unknown) => ({ table: "posts", args, count: 0 }) },
    $transaction: async (operations: unknown[]) => operations
  } as never;

  const result = await deleteAdminSocialPost(prisma, postRow.id);

  assert.deepEqual(result, { id: postRow.id, deleted: true, existed: false });
});

test("admin report status update uses statuses allowed by database constraint", async () => {
  const prisma = {
    social_reports: {
      update: async (args: unknown) => ({ args, id: "report-1", status: "reviewing", updated_at: new Date("2026-09-05T11:00:00.000Z") })
    }
  } as never;

  const result = await updateAdminSocialReportStatus(prisma, "report-1", "reviewing") as unknown as {
    id: string;
    status: string;
    updated_at: Date;
    args: unknown;
  };

  assert.equal(result.status, "reviewing");
  assert.deepEqual(result.args, {
    where: { id: "report-1" },
    data: { status: "reviewing" },
    select: { id: true, status: true, updated_at: true }
  });
});
