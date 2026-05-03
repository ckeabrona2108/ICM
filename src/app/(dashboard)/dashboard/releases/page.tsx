import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ReleasesListShell } from "@/components/dashboard/releases-list-shell";
import { authOptions } from "@/lib/auth";
import { getCabinetReleasesByUser } from "@/lib/cabinet-release-queries";

export default async function ReleasesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const cabinetReleases = await getCabinetReleasesByUser(session.user.id);
  const nonDraftReleases = cabinetReleases.filter(
    (release) => release.status === "approved" || release.status === "distributed"
  );
  return (
      <ReleasesListShell
        title="Все релизы"
        description="Каталог принятых и опубликованных релизов"
        releases={nonDraftReleases}
      />
  );
}
