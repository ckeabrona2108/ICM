"use client";

import * as React from "react";
import { motion } from "framer-motion";

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
            "relative rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 ease-out motion-reduce:transition-none",
            active === tab ? "text-white" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {active === tab ? (
            <motion.span
              layoutId="tabs-active-pill"
              className="absolute inset-0 rounded-lg bg-white/10"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          ) : null}
          <span className="relative z-[1]">{tab}</span>
        </button>
      ))}
    </div>
  );
}

export const Tabs = React.memo(TabsBase);
Tabs.displayName = "Tabs";
