import { AdminSocialModerationClient } from "@/components/admin/admin-social-moderation-client";
import { listAdminSocialModeration } from "@/lib/admin-social-moderation-service";
import { prisma } from "@/lib/prisma";

export default async function AdminSocialModerationPage() {
  const initialData = await listAdminSocialModeration(prisma);
  return <AdminSocialModerationClient initialData={initialData} />;
}
