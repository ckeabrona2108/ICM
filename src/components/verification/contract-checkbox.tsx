"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ContractCheckbox({
  checked,
  disabled,
  onChange,
  className
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-white/12 bg-white/[0.03] px-5 py-4 sm:px-6", className)}>
      <Label className="flex items-start gap-3 text-[15px] leading-relaxed text-white/85 [overflow-wrap:anywhere]">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            const nextChecked = event.currentTarget.checked;
            onChange(nextChecked);
          }}
        />
        <span>Я ознакомлен и согласен с условиями договора</span>
      </Label>
      {disabled ? (
        <p className="mt-2 text-[13px] leading-relaxed text-white/55 [overflow-wrap:anywhere]">Сначала пролистайте документ до конца.</p>
      ) : null}
    </div>
  );
}
