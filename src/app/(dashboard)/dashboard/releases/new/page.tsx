import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ReleaseResumeChooser } from "@/components/releases/release-resume-chooser";
import { NewReleaseContractGate } from "@/components/verification/new-release-contract-gate";
import { authOptions } from "@/lib/auth";
import { getUserContractStatus } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";
import { listReleaseResumeCandidates } from "@/lib/release-resume-candidates";

export default async function NewReleasePage({
  searchParams
}: {
  searchParams?: { fresh?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const contractStatus = await getUserContractStatus({
    prisma,
    userId: session.user.id
  });

  // Offer to continue an unfinished release instead of creating another empty "Новый релиз".
  if (contractStatus.canCreateRelease && searchParams?.fresh !== "1") {
    const candidates = await listReleaseResumeCandidates(prisma, session.user.id);
    if (candidates.length > 0) {
      return <ReleaseResumeChooser candidates={candidates} />;
    }
  }

  return <NewReleaseContractGate initialStatus={contractStatus} />;
}
