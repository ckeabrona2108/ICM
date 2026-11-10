import { notFound } from "next/navigation";

import { AdminReleaseDetailsClient } from "@/components/admin/admin-release-details-client";
import { getAdminReleaseDetailsById } from "@/lib/admin-release-details";
import { requireAdminPage } from "@/lib/admin-page-guard";

export default async function AdminReleaseDetailsPage({ params }: { params: { id: string } }) {
  await requireAdminPage();
  const details = await getAdminReleaseDetailsById(params.id);

  if (!details) {
    notFound();
  }

  return <AdminReleaseDetailsClient details={details} />;
}
