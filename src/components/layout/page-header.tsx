import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  caption?: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, caption, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-1 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {caption ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] font-medium text-white/56">
            {caption}
          </div>
        ) : null}
        <h1 className="font-display text-[32px] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[36px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-white/64">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}
