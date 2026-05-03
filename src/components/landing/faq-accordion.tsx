"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
  q: string;
  a: string;
}

interface FaqAccordionProps {
  items: FaqItem[];
  className?: string;
}

export function FaqAccordion({ items, className }: FaqAccordionProps) {
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <div className={cn("divide-y divide-white/10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl", className)}>
      {items.map((item, idx) => {
        const isOpen = open === idx;
        return (
          <button
            key={item.q}
            type="button"
            onClick={() => setOpen(isOpen ? null : idx)}
            className="block w-full text-left"
          >
            <div className="flex items-center justify-between gap-6 px-6 py-5 sm:px-8 sm:py-6">
              <span className="font-display text-base font-medium text-white sm:text-lg">{item.q}</span>
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition-transform duration-300",
                  isOpen && "rotate-45 border-cyan-300/40 bg-cyan-300/10"
                )}
              >
                <Plus className="h-4 w-4 text-white" />
              </span>
            </div>
            <div
              className={cn(
                "grid overflow-hidden px-6 transition-all duration-300 ease-out sm:px-8",
                isOpen ? "grid-rows-[1fr] pb-6 opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="min-h-0">
                <p className="max-w-3xl text-sm leading-relaxed text-white/70 sm:text-base">{item.a}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
