import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { NewReleaseContractGate } from "@/components/verification/new-release-contract-gate";
import { authOptions } from "@/lib/auth";
import { getUserContractStatus } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

export default async function NewReleasePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const contractStatus = await getUserContractStatus({
    prisma,
    userId: session.user.id
  });

  return <NewReleaseContractGate initialStatus={contractStatus} />;
}
