import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ReleasesListShell } from "@/components/dashboard/releases-list-shell";
import { authOptions } from "@/lib/auth";
import { getCabinetDraftReleasesByUser } from "@/lib/cabinet-release-queries";

export default async function DraftsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const drafts = await getCabinetDraftReleasesByUser(session.user.id);
  return (
    <ReleasesListShell
      title="Черновики"
      releases={drafts}
      showPay={false}
      allowDraftDelete
      emptyTitle="Черновиков пока нет"
      emptyDescription="Незавершённые релизы автоматически попадают сюда. Начните создавать новый релиз — он сохранится в черновиках, пока вы не отправите его на модерацию."
    />
  );
}
