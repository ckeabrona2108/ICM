import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { UserProfileForm } from "@/components/user/user-profile-form";
import { authOptions } from "@/lib/auth";
import { getUserContractStatus } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const contractStatus = await getUserContractStatus({
    prisma,
    userId: session.user.id
  });

  return (
    <DashboardShell>
      <PageHeader
        title="Персональные данные"
        description="Изменяйте имя, email и аватар. Обновления применяются во всех разделах кабинета."
      />
      <UserProfileForm contractStatus={contractStatus} />
    </DashboardShell>
  );
}
