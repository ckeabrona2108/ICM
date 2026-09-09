import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardEmptyState, DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ReleaseShowcaseDashboardClient } from "@/components/releases/release-showcase-dashboard-client";
import { authOptions } from "@/lib/auth";
import { getSceneEligibleCabinetReleasesByUser } from "@/lib/cabinet-release-queries";
import { SCENE_RELEASE_WINDOW_DAYS } from "@/lib/scene-policy";

export const dynamic = "force-dynamic";

export default async function ShowcaseDashboardPage({
  searchParams
}: {
  searchParams?: { releaseId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const releases = await getSceneEligibleCabinetReleasesByUser(session.user.id);
  const highlightReleaseId = searchParams?.releaseId?.trim() || undefined;

  return (
    <DashboardShell>
      <PageHeader
        title="Витрина релизов"
        description={`Здесь отображаются ваши одобренные релизы, которые уже вышли и находятся в окне ${SCENE_RELEASE_WINDOW_DAYS} дней после даты выпуска.`}
      />

      {releases.length === 0 ? (
        <DashboardEmptyState
          title="Сейчас нет релизов для витрины"
          description={`Подходящий релиз появится здесь после одобрения и наступления даты выхода. Добавить фрагмент можно в течение ${SCENE_RELEASE_WINDOW_DAYS} дней после выпуска.`}
        />
      ) : (
        <ReleaseShowcaseDashboardClient
          releases={releases}
          highlightReleaseId={highlightReleaseId}
        />
      )}
    </DashboardShell>
  );
}
