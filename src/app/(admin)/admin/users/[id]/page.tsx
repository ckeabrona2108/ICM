import { notFound } from "next/navigation";

import { AdminUserDetailClient } from "@/components/admin/admin-user-detail-client";
import {
  adminUserReleasesQuerySchema,
  getAdminUserProfileDetails,
  listUserReleasesForAdmin
} from "@/lib/admin-user-service";
import { getUserFinanceView, type UserFinanceView } from "@/lib/finance-service";
import { prisma } from "@/lib/prisma";
import { listUserReports, type UserReportItem } from "@/lib/report-service";
import { getUserSubscription, type UserSubscriptionView } from "@/lib/subscription-service";

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

  const [finance, reports, subscription]: [UserFinanceView, UserReportItem[], UserSubscriptionView | null] =
    await Promise.all([
      getUserFinanceView(prisma, params.id),
      listUserReports(prisma, params.id),
      getUserSubscription(prisma, params.id)
    ]);

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
