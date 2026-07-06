import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardShell, DashboardEmptyState } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PromoDashboardClient } from "@/components/promo/promo-dashboard-client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPromoReleasesForUser } from "@/lib/promo-service";

export const dynamic = "force-dynamic";

export default async function PromoDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const releases = await getPromoReleasesForUser(prisma, session.user.id);

  return (
    <DashboardShell>
      <PageHeader
        title="Промо"
        description="Отправьте релиз на промо-поддержку ICECREAMMUSIC. Доступны только релизы, которые находятся в разрешенном промо-окне."
      />

      {releases.length === 0 ? (
        <DashboardEmptyState
          title="Пока нет релизов для промо"
          description="Когда в кабинете появятся ваши релизы, здесь можно будет отправлять подходящие релизы на промо-поддержку."
        />
      ) : (
        <PromoDashboardClient initialReleases={releases} />
      )}
    </DashboardShell>
  );
}
