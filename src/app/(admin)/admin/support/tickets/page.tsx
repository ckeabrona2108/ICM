import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AdminSupportTicketsList } from "@/components/admin/admin-support-tickets-list";
import { listAdminSupportTickets } from "@/lib/support-service";
import { prisma } from "@/lib/prisma";

export default async function AdminSupportTicketsPage() {
  const tickets = await listAdminSupportTickets(prisma);

  return (
    <DashboardShell>
      <PageHeader
        title="Тикеты поддержки"
        description="Все пользовательские обращения. Ответы отправляются только через админ-панель."
      />
      <AdminSupportTicketsList initialTickets={tickets} />
    </DashboardShell>
  );
}
