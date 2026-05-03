import { notFound } from "next/navigation";

import { AdminUserDetailClient } from "@/components/admin/admin-user-detail-client";
import {
  adminUserReleasesQuerySchema,
  getAdminUserProfileDetails,
  listUserReleasesForAdmin
} from "@/lib/admin-user-service";
import { getUserFinanceView } from "@/lib/finance-service";
import { listUserReports } from "@/lib/report-service";
import { getUserSubscription } from "@/lib/subscription-service";
import { prisma } from "@/lib/prisma";

export default async function AdminUserDetailsPage({ params }: { params: { id: string } }) {
  const profile = await getAdminUserProfileDetails(prisma, params.id);
  if (!profile) {
    notFound();
  }

  const [releases, finance, reports, subscription] = await Promise.all([
    listUserReleasesForAdmin(
      prisma,
      params.id,
      adminUserReleasesQuerySchema.parse({ page: 1, perPage: 20 })
    ),
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
