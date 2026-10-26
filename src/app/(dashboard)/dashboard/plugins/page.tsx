import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { GlazePluginShowcase } from "@/components/plugins/glaze-plugin-showcase";

export default function DashboardPluginsPage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Плагины GLAZE"
        description="Инструменты для вокала и битов. Работают в FL Studio, Ableton, Logic и других DAW."
      />
      <GlazePluginShowcase />
    </DashboardShell>
  );
}
