import { notFound } from "next/navigation";

import { AdminReleaseDetailsClient } from "@/components/admin/admin-release-details-client";
import { getAdminReleaseDetailsById } from "@/lib/admin-release-details";

export default async function AdminReleaseDetailsPage({ params }: { params: { id: string } }) {
  const details = await getAdminReleaseDetailsById(params.id);

  if (!details) {
    notFound();
  }

  return <AdminReleaseDetailsClient details={details} />;
}
