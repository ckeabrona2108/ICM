import { notFound } from "next/navigation";

import { AdminUserDetailClient } from "@/components/admin/admin-user-detail-client";
import {
  adminUserReleasesQuerySchema,
  getAdminUserProfileDetails,
  listUserReleasesForAdmin
} from "@/lib/admin-user-service";
import type { UserFinanceView } from "@/lib/finance-service";
import { prisma } from "@/lib/prisma";
import type { UserReportItem } from "@/lib/report-service";
import type { UserSubscriptionView } from "@/lib/subscription-service";

export default async function AdminUserDetailsPage({ params }: { params: { id: string } }) {
  const profile = await getAdminUserProfileDetails(prisma, params.id);
  if (!profile) {
    notFound();
  }

  const releases = await listUserReleasesForAdmin(
    prisma,
    params.id,
    adminUserReleasesQuerySchema.parse({ page: 1, perPage: 20 })
  );

  const finance: UserFinanceView = {
    agreedBalance: profile.balance,
    pendingBalance: 0,
    pendingPayout: 0,
    agreedReportsBalance: profile.balance,
    settlementDelta: 0,
    availableToWithdraw: profile.balance,
    reportsCount: 0,
    transactions: []
  };

  const reports: UserReportItem[] = [];
  const subscription: UserSubscriptionView | null = null;

  return (
    <AdminUserDetailClient
      initialProfile={profile}
      initialReleases={releases}
      initialFinance={finance}
      initialReports={reports}
      initialSubscription={subscription}
    />
  );
}
