import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AdminSupportTicketDetail } from "@/components/admin/admin-support-ticket-detail";
import { getAdminSupportTicket, SupportNotFoundError } from "@/lib/support-service";
import { prisma } from "@/lib/prisma";

export default async function AdminSupportTicketPage({
  params
}: {
  params: { id: string };
}) {
  let ticket;
  try {
    ticket = await getAdminSupportTicket(prisma, params.id);
  } catch (error) {
    if (error instanceof SupportNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <DashboardShell>
      <PageHeader
        title="Тикет поддержки"
        description={`ID: ${ticket.id}`}
        actions={
          <Link href="/admin/support/tickets">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Назад к списку
            </Button>
          </Link>
        }
      />
      <AdminSupportTicketDetail initialTicket={ticket} />
    </DashboardShell>
  );
}
