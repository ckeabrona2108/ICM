import { DirectMessagesPanel } from "@/components/messages/direct-messages-panel";
import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function MessagesPage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Личные сообщения"
        description="Личные диалоги с артистами, группами и лейблами сохраняются отдельно от обращений в поддержку."
      />

      <div className="space-y-6 pb-10">
        <DirectMessagesPanel />
      </div>
    </DashboardShell>
  );
}
