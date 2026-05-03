"use client";

import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { UserProfileForm } from "@/components/user/user-profile-form";

export default function ProfilePage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Персональные данные"
        description="Изменяйте имя, email и аватар. Обновления применяются во всех разделах кабинета."
      />
      <UserProfileForm />
    </DashboardShell>
  );
}
