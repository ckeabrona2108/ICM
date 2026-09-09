import { AdminReleasesClient } from "@/components/admin/admin-releases-client";
import { getAdminReleases, type AdminReleaseStatusFilter } from "@/lib/admin-release-queries";

const ADMIN_RELEASE_TABS = new Set<AdminReleaseStatusFilter>([
  "moderation",
  "pending_verification",
  "deletion_requests",
  "all",
  "approved",
  "rejected"
]);

function normalizeInitialTab(value: string | string[] | undefined): AdminReleaseStatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return ADMIN_RELEASE_TABS.has(raw as AdminReleaseStatusFilter)
    ? (raw as AdminReleaseStatusFilter)
    : "moderation";
}

export default async function AdminReleasesPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialTab = normalizeInitialTab(params?.status);
  const releases = await getAdminReleases(initialTab);
  return <AdminReleasesClient initialReleases={releases} initialTab={initialTab} />;
}
