import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { ReleaseEditClient } from "@/components/releases/release-edit-client";
import { authOptions } from "@/lib/auth";
import { getCabinetReleaseByIdForUser } from "@/lib/cabinet-release-queries";

export const dynamic = "force-dynamic";

export default async function EditReleasePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const release = await getCabinetReleaseByIdForUser(session.user.id, params.id);
  if (!release) notFound();

  // A release in moderation must never reopen its editable wizard after a
  // refresh. The details page is the single source of truth for its status.
  if (release.status === "moderation") {
    redirect(`/dashboard/releases/${params.id}`);
  }

  return <ReleaseEditClient release={release} />;
}
