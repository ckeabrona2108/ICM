import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { ReleaseEditClient } from "@/components/releases/release-edit-client";
import { authOptions } from "@/lib/auth";
import { getCabinetReleaseByIdForUser } from "@/lib/cabinet-release-queries";
import { prisma } from "@/lib/prisma";
import { readReleaseCopySourceId } from "@/lib/release-resubmission";

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

  // A saved copy of an approved release is compared with its original on the review step.
  const stored = await prisma.release.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { roles: true }
  });
  const copySourceId = readReleaseCopySourceId(stored?.roles);
  const copySource = copySourceId ? await getCabinetReleaseByIdForUser(session.user.id, copySourceId) : null;

  return <ReleaseEditClient release={release} copySource={copySource} />;
}
