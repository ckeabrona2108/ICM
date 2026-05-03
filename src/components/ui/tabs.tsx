"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (value: string) => void;
}

function TabsBase({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm transition",
            active === tab ? "bg-white/10 text-white" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export const Tabs = React.memo(TabsBase);
Tabs.displayName = "Tabs";
