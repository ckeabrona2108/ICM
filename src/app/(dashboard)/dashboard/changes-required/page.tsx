import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ReleasesListShell } from "@/components/dashboard/releases-list-shell";
import { authOptions } from "@/lib/auth";
import { getCabinetReleasesByUser } from "@/lib/cabinet-release-queries";

export default async function ChangesRequiredPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const cabinetReleases = await getCabinetReleasesByUser(session.user.id);
  const items = cabinetReleases.filter(
    (r) => r.status === "changes_required" || r.status === "rejected"
  );
  return (
    <ReleasesListShell
      title="Требуются изменения"
      description="Модератор оставил замечания. Внесите правки и отправьте релиз повторно."
      releases={items}
      emptyTitle="Замечаний нет"
      emptyDescription="Когда модератор запросит изменения, релизы появятся в этом списке."
    />
  );
}
