// @ts-nocheck
import { FinanceReportStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { SubscriptionPlan, SubscriptionStatus } from "@/lib/subscription-service";

export * from "@/lib/admin-user-service";

import {
  canManageUsers,
  getAdminUserProfileDetails,
  listAdminUsers as listAdminUsersPaged,
  type AdminUserProfileDetails
} from "@/lib/admin-user-service";
import { adjustUserBalanceByAdmin, topUpUserBalanceByAdmin } from "@/lib/finance-service";
import {
  createUserReportByAdmin,
  listUserReports,
  resendUserReportToUser,
  updateUserReportByAdmin,
  type UserReportLineItem
} from "@/lib/report-service";
import {
  getUserSubscription,
  updateUserSubscriptionByAdmin
} from "@/lib/subscription-service";
import { listUserReleasesForAdmin } from "@/lib/admin-user-service";

export const adminTopUpSchema = z.object({
  amount: z.number().positive("Сумма пополнения должна быть больше 0.").max(10_000_000),
  description: z.string().trim().max(240).optional()
});

export const adminCreateReportSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  amount: z.number().nonnegative("Сумма отчёта не может быть отрицательной.").max(10_000_000),
  status: z.enum(["READY_TO_CONFIRM", "AGREED"]),
  quarter: z.number().int().min(1).max(4).nullable().optional(),
  year: z.number().int().min(2000).max(3000).nullable().optional(),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120).optional(),
        platformName: z.string().trim().min(1, "Укажите площадку.").max(160),
        upc: z.string().trim().max(120).optional().default(""),
        releaseTitle: z.string().trim().min(1, "Укажите релиз.").max(240),
        amount: z.number().positive("Сумма строки должна быть больше 0.").max(10_000_000)
      })
    )
    .max(500)
    .optional()
    .default([]),
  comment: z.string().trim().max(500).optional()
});

const subscriptionPlanSchema = z.enum(["standard", "professional", "premium", "enterprise", "pro"]).transform((value) => (value === "pro" ? "professional" : value) as SubscriptionPlan);

const subscriptionStatusSchema = z.enum(["active", "expired", "canceled"]).transform((value) => (value === "active" ? "active" : "canceled") as SubscriptionStatus);

export const adminUpdateSubscriptionSchema = z.object({
  plan: subscriptionPlanSchema,
  status: subscriptionStatusSchema,
  endsAt: z.string().datetime().nullable(),
  comment: z.string().trim().max(500).optional()
});

export const adminBalanceAdjustSchema = z.object({
  type: z.enum(["credit", "debit"]),
  amount: z.number().positive("Сумма должна быть больше 0.").max(10_000_000),
  comment: z.string().trim().min(3, "Комментарий администратора обязателен.").max(500)
});

export interface AdminUserDetails extends AdminUserProfileDetails {
  releases: Awaited<ReturnType<typeof listUserReleasesForAdmin>>["items"];
  reports: Awaited<ReturnType<typeof listUserReports>>;
  subscription: Awaited<ReturnType<typeof getUserSubscription>>;
}

export async function listAdminUsers(prisma: PrismaClient) {
  const result = await listAdminUsersPaged(prisma, {
    q: undefined,
    subscription: undefined,
    status: undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
    page: 1,
    perPage: 500
  });
  return result.items.map((item) => ({
    ...item,
    agreedBalance: item.balance
  }));
}

export async function getAdminUserDetails(
  prisma: PrismaClient,
  userId: string
): Promise<AdminUserDetails | null> {
  const profile = await getAdminUserProfileDetails(prisma, userId);
  if (!profile) return null;
  const [releases, reports, subscription] = await Promise.all([
    listUserReleasesForAdmin(prisma, userId, {
      status: undefined,
      page: 1,
      perPage: 50
    }),
    listUserReports(prisma, userId),
    getUserSubscription(prisma, userId)
  ]);

  return {
    ...profile,
    releases: releases.items,
    reports,
    subscription
  };
}

export async function adminTopUpUserBalance(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  amount: number;
  description?: string;
}) {
  return topUpUserBalanceByAdmin({
    prisma: params.prisma,
    adminId: params.adminId,
    userId: params.userId,
    amount: params.amount,
    comment: params.description
  });
}

export async function adminCreateUserFinanceReport(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: "READY_TO_CONFIRM" | "AGREED";
  quarter?: number | null;
  year?: number | null;
  items?: UserReportLineItem[];
  comment?: string;
}) {
  return createUserReportByAdmin({
    prisma: params.prisma,
    adminId: params.adminId,
    userId: params.userId,
    periodStart: new Date(params.periodStart),
    periodEnd: new Date(params.periodEnd),
    amount: params.amount,
    status:
      params.status === "AGREED"
        ? FinanceReportStatus.AGREED
        : FinanceReportStatus.READY_TO_CONFIRM,
    quarter: params.quarter ?? null,
    year: params.year ?? null,
    items: params.items ?? [],
    comment: params.comment
  });
}

export async function adminUpdateUserFinanceReport(params: {
  prisma: PrismaClient;
  adminId: string;
  reportId: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: "READY_TO_CONFIRM" | "AGREED";
  quarter?: number | null;
  year?: number | null;
  items?: UserReportLineItem[];
  comment?: string;
}) {
  return updateUserReportByAdmin({
    prisma: params.prisma,
    adminId: params.adminId,
    reportId: params.reportId,
    userId: params.userId,
    periodStart: new Date(params.periodStart),
    periodEnd: new Date(params.periodEnd),
    amount: params.amount,
    status:
      params.status === "AGREED"
        ? FinanceReportStatus.AGREED
        : FinanceReportStatus.READY_TO_CONFIRM,
    quarter: params.quarter ?? null,
    year: params.year ?? null,
    items: params.items ?? [],
    comment: params.comment
  });
}

export async function adminResendUserFinanceReport(params: {
  prisma: PrismaClient;
  reportId: string;
  userId: string;
}) {
  return resendUserReportToUser({
    prisma: params.prisma,
    reportId: params.reportId,
    userId: params.userId
  });
}

export async function adminUpdateUserSubscription(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  endsAt: string | null;
  comment?: string;
}) {
  return updateUserSubscriptionByAdmin({
    prisma: params.prisma,
    adminId: params.adminId,
    userId: params.userId,
    plan: params.plan,
    status: params.status,
    endsAt: params.endsAt ? new Date(params.endsAt) : null,
    comment: params.comment
  });
}

export async function adminAdjustUserBalance(params: {
  prisma: PrismaClient;
  adminId: string;
  userId: string;
  type: "credit" | "debit";
  amount: number;
  comment: string;
}) {
  return adjustUserBalanceByAdmin(params);
}

export { canManageUsers };
