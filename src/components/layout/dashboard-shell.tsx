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
  return <div className={cn("perf-content-auto space-y-6 pb-10", className)}>{children}</div>;
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
        "ux-surface perf-content-auto perf-paint-contain rounded-[28px] p-5 sm:p-6",
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
        "ux-empty flex flex-col items-center justify-center gap-3 rounded-[28px] border-dashed py-16 text-center",
        className
      )}
    >
      <span className="ux-surface-soft grid h-12 w-12 place-items-center rounded-full text-white/55">
        <Inbox className="h-5 w-5" />
      </span>
      <h3 className="text-[20px] font-semibold text-white">{title}</h3>
      <p className="max-w-md text-[15px] font-medium leading-6 text-white/62">{description}</p>
    </div>
  );
}
