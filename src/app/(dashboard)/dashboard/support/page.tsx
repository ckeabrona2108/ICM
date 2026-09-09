import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell, PageSection } from "@/components/layout/dashboard-shell";
import { SupportTicketChat } from "@/components/support/support-ticket-chat";

export default function SupportPage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Поддержка"
        description="Тикеты и переписка с командой поддержки хранятся отдельно от личных сообщений."
      />
      <PageSection className="overflow-hidden p-0">
        <SupportTicketChat />
      </PageSection>
    </DashboardShell>
  );
}
