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
        description="Отправьте одобренный релиз на промо-поддержку ICECREAMMUSIC. Заявки принимаются до дня выхода, для питчинга в плейлисты — не позднее чем за 13 дней до него."
      />

      {releases.length === 0 ? (
        <DashboardEmptyState
          title="Пока нет одобренных релизов"
          description="Заявку на промо можно подать, когда релиз пройдёт модерацию и получит UPC, и до дня его выхода. Для питчинга в плейлисты отправляйте заявку не позднее чем за 13 дней до выхода: выберите дату с пометкой «промо» в мастере релиза."
        />
      ) : (
        <PromoDashboardClient initialReleases={releases} />
      )}
    </DashboardShell>
  );
}
