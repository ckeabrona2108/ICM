import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function DashboardLoading() {
  return (
    <DashboardShell>
      <div className="mb-6 space-y-2">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-white/[0.08]" />
        <div className="h-5 w-[420px] max-w-full animate-pulse rounded-lg bg-white/[0.05]" />
      </div>

      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-white/[0.08] bg-[#13151d]/92" />
        <div className="h-24 animate-pulse rounded-2xl border border-white/[0.08] bg-[#13151d]/92" />
        <div className="h-24 animate-pulse rounded-2xl border border-white/[0.08] bg-[#13151d]/92" />
      </div>
    </DashboardShell>
  );
}
