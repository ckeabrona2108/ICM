import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { GlazePluginShowcase } from "@/components/plugins/glaze-plugin-showcase";

export default function DashboardPluginsPage() {
  return (
    <DashboardShell>
      <PageHeader
        caption={
          <span className="rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#93c5fd]">
            GLAZE Audio Plugins
          </span>
        }
        title="Плагины GLAZE"
        description="Инструменты для вокала и битов. Работают в FL Studio, Ableton, Logic и других DAW."
      />
      <GlazePluginShowcase />
    </DashboardShell>
  );
}
