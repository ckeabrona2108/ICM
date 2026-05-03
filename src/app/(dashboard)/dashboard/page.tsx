import Link from "next/link";
import { Plus } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { NewsListClient } from "@/components/news/news-list-client";

export default function DashboardPage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Новости"
        description="Обновления платформы, поддержка и важные уведомления по работе кабинета."
        actions={
          <Link
            href="/dashboard/releases/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#7b3df5] px-4 text-[15px] font-semibold text-white transition-colors hover:bg-[#8b4ff7]"
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
