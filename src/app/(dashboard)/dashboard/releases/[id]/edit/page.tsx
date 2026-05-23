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

  return <ReleaseEditClient release={release} />;
}
