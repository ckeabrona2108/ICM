import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ReleasesListShell } from "@/components/dashboard/releases-list-shell";
import { authOptions } from "@/lib/auth";
import { getCabinetDraftReleasesByUser } from "@/lib/cabinet-release-queries";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const draftReleases = await getCabinetDraftReleasesByUser(session.user.id);

  return (
    <ReleasesListShell
      title="Черновики"
      description="Релизы, которые ещё не отправлены на модерацию."
      releases={draftReleases}
      allowDraftDelete
      emptyTitle="У вас пока нет черновиков"
      emptyDescription="Создайте новый релиз, чтобы черновик появился в этом разделе."
    />
  );
}
