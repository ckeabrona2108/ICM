import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ArtistPublicProfileSettings } from "@/components/user/artist-public-profile-settings";
import { authOptions } from "@/lib/auth";

export default async function ArtistProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <PageHeader
        title="Профиль артиста"
        description="Настройте публичную страницу артиста, каталог релизов и видимость контента в Community."
      />
      <ArtistPublicProfileSettings />
    </DashboardShell>
  );
}
