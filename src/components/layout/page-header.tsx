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
    <header className={cn("mb-6 flex flex-wrap items-start justify-between gap-4", className)}>
      <div>
        <h1 className="font-display text-[30px] font-bold leading-tight text-white sm:text-[34px]">
          {title}
        </h1>
        {caption ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-medium text-white/56">
            {caption}
          </div>
        ) : null}
        {description ? (
          <p className="mt-2 max-w-3xl text-[15px] font-medium text-white/72">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}
