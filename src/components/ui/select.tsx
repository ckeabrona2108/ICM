import * as React from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ label: string; value: string }>;
}

export function Select({ className, options, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "block h-12 min-h-12 w-full min-w-0 appearance-none truncate rounded-xl border border-white/[0.12] bg-black/25 px-4 py-0 pr-10 text-[15px] font-medium leading-[1.2] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/60",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-slate-950">
          {option.label}
        </option>
      ))}
    </select>
  );
}
