import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { NewsListClient } from "@/components/news/news-list-client";

export default function DashboardNewsPage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Новости"
        description="Обновления платформы, поддержка и важные уведомления по работе кабинета."
      />
      <NewsListClient />
    </DashboardShell>
  );
}
