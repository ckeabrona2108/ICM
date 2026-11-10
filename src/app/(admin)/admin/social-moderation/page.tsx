import { AdminSocialModerationClient } from "@/components/admin/admin-social-moderation-client";
import { listAdminSocialModeration } from "@/lib/admin-social-moderation-service";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/admin-page-guard";

export default async function AdminSocialModerationPage() {
  await requireAdminPage();
  const initialData = await listAdminSocialModeration(prisma);
  return <AdminSocialModerationClient initialData={initialData} />;
}
