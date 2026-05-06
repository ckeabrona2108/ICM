import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ReleasesListShell } from "@/components/dashboard/releases-list-shell";
import { authOptions } from "@/lib/auth";
import { getCabinetReleasesByUser } from "@/lib/cabinet-release-queries";

export default async function ModerationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const cabinetReleases = await getCabinetReleasesByUser(session.user.id);
  const items = cabinetReleases.filter(
    (r) => r.status === "moderation" || r.status === "pending_verification"
  );
  return (
    <ReleasesListShell
      title="Модерация"
      description="Релизы на проверке и релизы, ожидающие подтверждения верификации."
      releases={items}
      emptyTitle="На модерации сейчас пусто"
      emptyDescription="Здесь отображаются релизы, отправленные на проверку или ожидающие подтверждения верификации."
    />
  );
}
