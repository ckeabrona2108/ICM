import { AdminReleasesClient } from "@/components/admin/admin-releases-client";
import { getAdminReleases } from "@/lib/admin-release-queries";

export default async function AdminReleasesPage() {
  const releases = await getAdminReleases("moderation");
  return <AdminReleasesClient initialReleases={releases} initialTab="moderation" />;
}
