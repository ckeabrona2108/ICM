import type { PrismaClient } from "@prisma/client";

import { parseStructuredPostContent } from "@/lib/collaboration";

export type AdminSocialReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

export interface AdminModerationUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface AdminModerationPost {
  id: string;
  author: AdminModerationUser;
  content: string;
  rawContent: string;
  audience: string;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSocialReport {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  reporter: AdminModerationUser;
  reportedUser: AdminModerationUser;
  targetPost: AdminModerationPost | null;
  createdAt: string;
  updatedAt: string;
}

function mapUser(user: { id: string; name: string; email: string; avatar: string | null }): AdminModerationUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar
  };
}

function mapPost(post: {
  id: string;
  content: string;
  audience: string;
  created_at: Date;
  updated_at: Date;
  author: { id: string; name: string; email: string; avatar: string | null };
}): AdminModerationPost {
  const parsed = parseStructuredPostContent(post.content);
  return {
    id: post.id,
    author: mapUser(post.author),
    content: parsed.content || post.content,
    rawContent: post.content,
    audience: post.audience,
    hidden: post.audience !== "PUBLIC",
    createdAt: post.created_at.toISOString(),
    updatedAt: post.updated_at.toISOString()
  };
}

async function listTargetPosts(prisma: PrismaClient, postIds: string[]) {
  if (!postIds.length) return new Map<string, AdminModerationPost>();
  const posts = await prisma.artist_profile_posts.findMany({
    where: { id: { in: Array.from(new Set(postIds)) } },
    orderBy: [{ created_at: "desc" }],
    select: {
      id: true,
      content: true,
      audience: true,
      created_at: true,
      updated_at: true,
      author: { select: { id: true, name: true, email: true, avatar: true } }
    }
  });
  return new Map(posts.map((post) => [post.id, mapPost(post)]));
}

export async function listAdminSocialModeration(prisma: PrismaClient) {
  const [reports, posts] = await Promise.all([
    prisma.social_reports.findMany({
      orderBy: [{ status: "asc" }, { created_at: "desc" }],
      take: 120,
      include: {
        reporter: { select: { id: true, name: true, email: true, avatar: true } },
        reported_user: { select: { id: true, name: true, email: true, avatar: true } }
      }
    }),
    prisma.artist_profile_posts.findMany({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 120,
      select: {
        id: true,
        content: true,
        audience: true,
        created_at: true,
        updated_at: true,
        author: { select: { id: true, name: true, email: true, avatar: true } }
      }
    })
  ]);

  const postMap = await listTargetPosts(
    prisma,
    reports.filter((report) => report.target_type === "post").map((report) => report.target_id)
  );

  return {
    reports: reports.map((report): AdminSocialReport => ({
      id: report.id,
      targetType: report.target_type,
      targetId: report.target_id,
      reason: report.reason,
      details: report.details,
      status: report.status,
      reporter: mapUser(report.reporter),
      reportedUser: mapUser(report.reported_user),
      targetPost: report.target_type === "post" ? postMap.get(report.target_id) ?? null : null,
      createdAt: report.created_at.toISOString(),
      updatedAt: report.updated_at.toISOString()
    })),
    posts: posts.map(mapPost)
  };
}

export async function hideAdminSocialPost(prisma: PrismaClient, postId: string) {
  const post = await prisma.artist_profile_posts.update({
    where: { id: postId },
    data: { audience: "PRIVATE" },
    select: {
      id: true,
      content: true,
      audience: true,
      created_at: true,
      updated_at: true,
      author: { select: { id: true, name: true, email: true, avatar: true } }
    }
  });
  await prisma.social_activity_events.deleteMany({ where: { kind: "POST", source_id: postId } });
  return mapPost(post);
}

export async function restoreAdminSocialPost(prisma: PrismaClient, postId: string) {
  const post = await prisma.artist_profile_posts.update({
    where: { id: postId },
    data: { audience: "PUBLIC" },
    select: {
      id: true,
      content: true,
      audience: true,
      created_at: true,
      updated_at: true,
      author: { select: { id: true, name: true, email: true, avatar: true } }
    }
  });
  return mapPost(post);
}

export async function deleteAdminSocialPost(prisma: PrismaClient, postId: string) {
  const [, , , deletedPosts] = await prisma.$transaction([
    prisma.artist_profile_post_likes.deleteMany({ where: { post_id: postId } }),
    prisma.artist_profile_post_comments.deleteMany({ where: { post_id: postId } }),
    prisma.social_activity_events.deleteMany({ where: { kind: "POST", source_id: postId } }),
    prisma.artist_profile_posts.deleteMany({ where: { id: postId } })
  ]);
  return { id: postId, deleted: true as const, existed: deletedPosts.count > 0 };
}

export async function updateAdminSocialReportStatus(
  prisma: PrismaClient,
  reportId: string,
  status: AdminSocialReportStatus
) {
  return prisma.social_reports.update({
    where: { id: reportId },
    data: { status },
    select: { id: true, status: true, updated_at: true }
  });
}
