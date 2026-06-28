import * as React from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export function DashboardShell({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("perf-content-auto pb-12", className)}>{children}</div>;
}

export function PageSection({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "perf-content-auto perf-paint-contain rounded-2xl border border-white/[0.08] bg-[#13151d]/92 p-4 shadow-[0_8px_24px_-20px_rgba(11,14,24,0.76)] backdrop-blur-[2px] sm:p-5",
        className
      )}
    >
      {children}
    </section>
  );
}

export function FilterPanel({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <PageSection className={cn("mb-5", className)}>{children}</PageSection>;
}

export function DashboardEmptyState({
  title,
  description,
  className
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] py-20 text-center",
        className
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-white/[0.06] text-white/55">
        <Inbox className="h-5 w-5" />
      </span>
      <h3 className="text-[18px] font-semibold text-white">{title}</h3>
      <p className="max-w-md text-[15px] font-medium text-white/68">{description}</p>
    </div>
  );
}
