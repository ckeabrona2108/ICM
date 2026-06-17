import { z } from "zod";
import type { PrismaClient, subscribe_level } from "@prisma/client";
import { resolveStoredFileUrl } from "@/lib/s3";

export type AdminUserAccountStatus = "ACTIVE" | "INACTIVE";

export interface AdminUserTableItem {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
  subscriptionPlan: subscribe_level | null;
  subscriptionStatus: string | null;
  accountStatus: AdminUserAccountStatus;
  balance: number;
  releaseCount: number;
}

export interface AdminUsersListResult {
  items: AdminUserTableItem[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface AdminUserRelease {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  moderationStartedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
}

export interface AdminUserProfileDetails {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
  updatedAt: string;
  accountStatus: AdminUserAccountStatus;
  subscriptionPlan: subscribe_level | null;
  subscriptionStatus: string | null;
  balance: number;
  releaseCount: number;
}

export const adminUsersListQuerySchema = z.object({
  q: z.string().trim().optional(),
  subscription: z.enum(["standard", "professional", "premium", "enterprise"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ACTIVE_ONLY", "INACTIVE_ONLY"]).optional(),
  sortBy: z.enum(["createdAt", "balance", "releaseCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
});

export const adminUserReleasesQuerySchema = z.object({
  status: z.enum(["moderating", "approved", "rejected"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
});

export function canManageUsers(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

function includesQuery(user: { id: string; name: string; email: string }, query: string): boolean {
  const q = query.toLowerCase();
  return (
    user.id.toLowerCase().includes(q) ||
    user.name.toLowerCase().includes(q) ||
    user.email.toLowerCase().includes(q)
  );
}

function mapAccountStatus(isSubscribed: boolean | null | undefined): AdminUserAccountStatus {
  return isSubscribed ? "ACTIVE" : "INACTIVE";
}

function looksLikeOnlyExtension(value: string): boolean {
  return /^[a-z0-9]{2,8}$/iu.test(value.trim().replace(/^\./u, ""));
}

function resolveUserAvatarUrl(userId: string, avatar: string | null): string | null {
  const rawAvatar = avatar?.trim();
  if (!rawAvatar) return null;

  if (looksLikeOnlyExtension(rawAvatar)) {
    const extension = rawAvatar.replace(/^\./u, "");
    return resolveStoredFileUrl({ storageKey: `avatars/${userId}.${extension}` });
  }

  const resolved = resolveStoredFileUrl({ url: rawAvatar, storageKey: null });
  if (resolved) return resolved;
  if (/^https?:\/\/s3\.icecreammusic\.net\//iu.test(rawAvatar)) return null;
  return rawAvatar;
}

export async function listAdminUsers(
  prisma: PrismaClient,
  params: z.infer<typeof adminUsersListQuerySchema>
): Promise<AdminUsersListResult> {
  const baseUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      isAdmin: true,
      isSubscribed: true,
      subscribeLevel: true,
      balance: true,
      emailVerified: true,
      _count: {
        select: {
          release: true
        }
      }
    }
  });

  let items = baseUsers
    .filter((user) => !user.isAdmin)
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: resolveUserAvatarUrl(user.id, user.avatar),
      role: user.isAdmin ? "ADMIN" : "USER",
      createdAt: (user.emailVerified ?? new Date(0)).toISOString(),
      subscriptionPlan: user.subscribeLevel,
      subscriptionStatus: user.isSubscribed ? "active" : null,
      accountStatus: mapAccountStatus(user.isSubscribed),
      balance: Number(user.balance ?? 0),
      releaseCount: user._count.release
    } satisfies AdminUserTableItem));

  if (params.q) items = items.filter((item) => includesQuery(item, params.q ?? ""));
  if (params.subscription) items = items.filter((item) => item.subscriptionPlan === params.subscription);
  if (params.status === "ACTIVE" || params.status === "ACTIVE_ONLY") {
    items = items.filter((item) => item.accountStatus === "ACTIVE");
  }
  if (params.status === "INACTIVE" || params.status === "INACTIVE_ONLY") {
    items = items.filter((item) => item.accountStatus === "INACTIVE");
  }

  const direction = params.sortOrder === "asc" ? 1 : -1;
  items.sort((a, b) => {
    if (params.sortBy === "balance") return (a.balance - b.balance) * direction;
    if (params.sortBy === "releaseCount") return (a.releaseCount - b.releaseCount) * direction;
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    return (da - db) * direction;
  });

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const page = Math.min(params.page, totalPages);
  const start = (page - 1) * params.perPage;

  return {
    items: items.slice(start, start + params.perPage),
    page,
    perPage: params.perPage,
    total,
    totalPages
  };
}

export async function getAdminUserProfileDetails(
  prisma: PrismaClient,
  userId: string
): Promise<AdminUserProfileDetails | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      isAdmin: true,
      isSubscribed: true,
      subscribeLevel: true,
      balance: true,
      emailVerified: true,
      _count: {
        select: {
          release: true
        }
      }
    }
  });

  if (!user) return null;

  const createdAt = user.emailVerified ?? new Date(0);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: resolveUserAvatarUrl(user.id, user.avatar),
    role: user.isAdmin ? "ADMIN" : "USER",
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    accountStatus: mapAccountStatus(user.isSubscribed),
    subscriptionPlan: user.subscribeLevel,
    subscriptionStatus: user.isSubscribed ? "active" : null,
    balance: Number(user.balance ?? 0),
    releaseCount: user._count.release
  };
}

export async function listUserReleasesForAdmin(
  prisma: PrismaClient,
  userId: string,
  params: z.infer<typeof adminUserReleasesQuerySchema>
): Promise<{ items: AdminUserRelease[]; page: number; perPage: number; total: number; totalPages: number }> {
  const where = {
    userId,
    ...(params.status ? { status: params.status } : {})
  };

  const [total, releases] = await Promise.all([
    prisma.release.count({ where }),
    prisma.release.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      select: {
        id: true,
        title: true,
        status: true,
        date: true
      }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  return {
    items: releases.map((release) => ({
      id: release.id,
      title: release.title,
      status: release.status,
      createdAt: release.date.toISOString(),
      updatedAt: release.date.toISOString(),
      moderationStartedAt: null,
      approvedAt: release.status === "approved" ? release.date.toISOString() : null,
      rejectedAt: release.status === "rejected" ? release.date.toISOString() : null
    })),
    page: params.page,
    perPage: params.perPage,
    total,
    totalPages
  };
}
