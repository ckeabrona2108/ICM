import {
  FinanceReportStatus,
  ReleaseStatus,
  Role,
  SubscriptionPlan,
  SubscriptionStatus,
  TransactionStatus,
  TransactionType,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { z } from "zod";
import { computeSettlementDelta } from "@/lib/finance-service";
import { getSubscriptionEffectiveEndDate } from "@/lib/subscription-service";

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

export type AdminUserAccountStatus = "ACTIVE" | "INACTIVE";

export interface AdminUserTableItem {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  createdAt: string;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionStatus: SubscriptionStatus | null;
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
  status: ReleaseStatus;
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
  role: Role;
  createdAt: string;
  updatedAt: string;
  accountStatus: AdminUserAccountStatus;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionStatus: SubscriptionStatus | null;
  balance: number;
  releaseCount: number;
}

export const adminUsersListQuerySchema = z.object({
  q: z.string().trim().optional(),
  subscription: z.nativeEnum(SubscriptionPlan).optional(),
  status: z
    .enum(["ACTIVE", "INACTIVE", "ACTIVE_ONLY", "INACTIVE_ONLY"])
    .optional(),
  sortBy: z.enum(["createdAt", "balance", "releaseCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
});

export const adminUserReleasesQuerySchema = z.object({
  status: z.nativeEnum(ReleaseStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
});

export function canManageUsers(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

function mapAccountStatus(
  status: SubscriptionStatus | null | undefined,
  endsAt: Date | null | undefined
): AdminUserAccountStatus {
  if (!status) return "INACTIVE";
  if (status === SubscriptionStatus.CANCELED || status === SubscriptionStatus.EXPIRED) {
    return "INACTIVE";
  }
  if (endsAt && endsAt.getTime() < Date.now()) {
    return "INACTIVE";
  }
  return "ACTIVE";
}

function includesQuery(user: { id: string; name: string; email: string }, query: string): boolean {
  const q = query.toLowerCase();
  return (
    user.id.toLowerCase().includes(q) ||
    user.name.toLowerCase().includes(q) ||
    user.email.toLowerCase().includes(q)
  );
}

export async function listAdminUsers(
  prisma: PrismaClient,
  params: z.infer<typeof adminUsersListQuerySchema>
): Promise<AdminUsersListResult> {
  const baseUsers = await prisma.user.findMany({
    where: {
      role: {
        not: Role.ADMIN
      }
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          endsAt: true,
          renewalAt: true
        }
      },
      _count: {
        select: {
          releases: true
        }
      },
      financeReports: {
        where: { status: FinanceReportStatus.AGREED },
        select: { amount: true }
      },
      transactions: {
        where: {
          status: TransactionStatus.COMPLETED,
          type: {
            in: [TransactionType.PAYOUT, TransactionType.REFUND, TransactionType.FEE]
          }
        },
        select: {
          type: true,
          amount: true
        }
      }
    }
  });

  let items = baseUsers.map((user) => {
    const reportsBalance = user.financeReports.reduce((sum, report) => sum + toNumber(report.amount), 0);
    const settlementDelta = computeSettlementDelta(user.transactions);
    const balance = reportsBalance + settlementDelta;
    const subscriptionPlan = user.subscription?.plan ?? null;
    const subscriptionStatus = user.subscription?.status ?? null;
    const subscriptionEndsAt = user.subscription
      ? getSubscriptionEffectiveEndDate({
          endsAt: user.subscription.endsAt ?? null,
          renewalAt: user.subscription.renewalAt ?? null
        })
      : null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      subscriptionPlan,
      subscriptionStatus,
      accountStatus: mapAccountStatus(subscriptionStatus, subscriptionEndsAt),
      balance,
      releaseCount: user._count.releases
    } satisfies AdminUserTableItem;
  });

  if (params.q) {
    items = items.filter((item) => includesQuery(item, params.q ?? ""));
  }
  if (params.subscription) {
    items = items.filter((item) => item.subscriptionPlan === params.subscription);
  }
  if (params.status === "ACTIVE" || params.status === "ACTIVE_ONLY") {
    items = items.filter((item) => item.accountStatus === "ACTIVE");
  }
  if (params.status === "INACTIVE" || params.status === "INACTIVE_ONLY") {
    items = items.filter((item) => item.accountStatus === "INACTIVE");
  }

  const direction = params.sortOrder === "asc" ? 1 : -1;
  items.sort((a, b) => {
    if (params.sortBy === "balance") {
      return (a.balance - b.balance) * direction;
    }
    if (params.sortBy === "releaseCount") {
      return (a.releaseCount - b.releaseCount) * direction;
    }
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    return (da - db) * direction;
  });

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const page = Math.min(params.page, totalPages);
  const start = (page - 1) * params.perPage;
  const paged = items.slice(start, start + params.perPage);

  return {
    items: paged,
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
      avatarUrl: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          endsAt: true,
          renewalAt: true
        }
      },
      _count: {
        select: {
          releases: true
        }
      },
      financeReports: {
        where: { status: FinanceReportStatus.AGREED },
        select: { amount: true }
      },
      transactions: {
        where: {
          status: TransactionStatus.COMPLETED,
          type: {
            in: [TransactionType.PAYOUT, TransactionType.REFUND, TransactionType.FEE]
          }
        },
        select: {
          type: true,
          amount: true
        }
      }
    }
  });
  if (!user) return null;
  const reportsBalance = user.financeReports.reduce((sum, report) => sum + toNumber(report.amount), 0);
  const settlementDelta = computeSettlementDelta(user.transactions);
  const balance = reportsBalance + settlementDelta;
  const subscriptionPlan = user.subscription?.plan ?? null;
  const subscriptionStatus = user.subscription?.status ?? null;
  const subscriptionEndsAt = user.subscription
    ? getSubscriptionEffectiveEndDate({
        endsAt: user.subscription.endsAt ?? null,
        renewalAt: user.subscription.renewalAt ?? null
      })
    : null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    accountStatus: mapAccountStatus(subscriptionStatus, subscriptionEndsAt),
    subscriptionPlan,
    subscriptionStatus,
    balance,
    releaseCount: user._count.releases
  };
}

export async function listUserReleasesForAdmin(
  prisma: PrismaClient,
  userId: string,
  params: z.infer<typeof adminUserReleasesQuerySchema>
): Promise<{ items: AdminUserRelease[]; page: number; perPage: number; total: number; totalPages: number }> {
  const where: Prisma.ReleaseWhereInput = {
    userId
  };
  if (params.status) where.status = params.status;

  const [total, releases] = await Promise.all([
    prisma.release.count({ where }),
    prisma.release.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        moderationStartedAt: true
      }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  return {
    items: releases.map((release) => ({
      id: release.id,
      title: release.title,
      status: release.status,
      createdAt: release.createdAt.toISOString(),
      updatedAt: release.updatedAt.toISOString(),
      moderationStartedAt: release.moderationStartedAt?.toISOString() ?? null,
      approvedAt: null,
      rejectedAt: null
    })),
    page: params.page,
    perPage: params.perPage,
    total,
    totalPages
  };
}
