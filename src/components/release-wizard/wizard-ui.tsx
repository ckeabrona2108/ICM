"use client";

import * as React from "react";
import { CalendarDays, Info } from "lucide-react";

import { cn } from "@/lib/utils";

export function WizardCard({
  title,
  description,
  className,
  children
}: {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-white/[0.08] bg-[#13151d]/85 p-5 shadow-[0_16px_44px_-28px_rgba(11,14,24,0.95)] backdrop-blur-xl sm:p-6", className)}>
      {title ? (
        <div className="mb-4">
          <h3 className="text-[20px] font-semibold text-white">{title}</h3>
          {description ? (
            <p className="mt-1 text-[15px] font-medium text-white/65">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function FieldLabel({
  children,
  hint,
  required
}: {
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="mb-1.5 flex items-center gap-1 text-[14px] font-medium text-white/72">
      <span>{children}</span>
      {required ? <span className="text-[#ff5d6d]">*</span> : null}
      {hint ? (
        <span title={hint} className="cursor-help text-white/30">
          <Info className="h-3 w-3" />
        </span>
      ) : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white placeholder:text-white/45 outline-none transition-colors focus:border-[#7b3df5]/60 focus:bg-white/[0.05]",
        props.className
      )}
    />
  );
}

function normalizeDateValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    return trimmed;
  }

  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(trimmed);
  if (!ru) return "";

  const [, dd, mm, yyyy] = ru;
  return `${yyyy}-${mm}-${dd}`;
}

export function DateInput({
  value,
  onChange,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const openPicker = React.useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }
    input.focus();
  }, []);

  return (
    <div className="relative">
      <input
        {...rest}
        ref={inputRef}
        type="date"
        value={normalizeDateValue(value)}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "icm-date-input h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 pr-10 text-[15px] font-medium text-white placeholder:text-white/45 outline-none transition-colors focus:border-[#7b3df5]/60 focus:bg-white/[0.05]",
          className
        )}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Открыть календарь"
        className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
    </div>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[88px] w-full resize-y rounded-xl border border-white/[0.12] bg-black/25 px-3.5 py-2.5 text-[15px] font-medium text-white placeholder:text-white/45 outline-none transition-colors focus:border-[#7b3df5]/60 focus:bg-white/[0.05]",
        props.className
      )}
    />
  );
}

interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  options: (SelectOption | string)[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-white/[0.12] bg-black/25 px-3.5 pr-9 text-[15px] font-medium text-white outline-none transition-colors focus:border-[#7b3df5]/60 focus:bg-white/[0.05]",
          !value && "text-white/45"
        )}
      >
        <option value="" disabled>
          {placeholder ?? "Выберите"}
        </option>
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value} className="bg-[#13141a] text-white">
              {opt.label}
            </option>
          );
        })}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  size = "md"
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 grid shrink-0 place-items-center rounded border transition-all",
          size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]",
          checked
            ? "border-[#7b3df5] bg-[#7b3df5]"
            : "border-white/15 bg-white/[0.03] hover:border-white/30"
        )}
      >
        {checked ? (
          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] text-white/85">{label}</span>
        {description ? (
          <span className="mt-1 block text-[12px] text-white/45">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
    </label>
  );
}

export function RadioPill({
  checked,
  onClick,
  children
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors",
        checked
          ? "border-[#7b3df5]/50 bg-[#7b3df5]/[0.12] text-white"
          : "border-white/[0.06] bg-white/[0.02] text-white/65 hover:border-white/[0.14] hover:text-white"
      )}
    >
      <span
        className={cn(
          "grid h-4 w-4 place-items-center rounded-full border transition-colors",
          checked ? "border-[#7b3df5] bg-[#7b3df5]" : "border-white/25"
        )}
      >
        {checked ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      <span>{children}</span>
    </button>
  );
}
