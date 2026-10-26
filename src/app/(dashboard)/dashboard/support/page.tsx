import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SupportTicketChat } from "@/components/support/support-ticket-chat";

export default function SupportPage() {
  return (
    <DashboardShell>
      <SupportTicketChat />
    </DashboardShell>
  );
}
