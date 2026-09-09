import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { NewsListClient } from "@/components/news/news-list-client";
import { authOptions } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin");
  }

  return (
    <DashboardShell>
      <PageHeader
        title="Новости"
        description="Обновления платформы, поддержка и важные уведомления по работе кабинета."
        actions={
          <Link
            href="/dashboard/releases/new"
            className="ux-button-primary inline-flex h-11 items-center gap-2 rounded-[18px] px-4 text-[15px] font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Новый релиз
          </Link>
        }
      />

      <NewsListClient />
    </DashboardShell>
  );
}
