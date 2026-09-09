"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";

const CONTROL_BASE =
  "w-full rounded-[18px] border border-white/[0.12] bg-black/25 text-[15px] font-medium text-[var(--ux-text)] placeholder:text-white/35 outline-none transition-[border-color,background-color,box-shadow,color,transform] focus:border-[var(--ux-accent)]/60 focus:bg-white/[0.055] focus:shadow-[0_0_0_3px_rgba(123,97,255,0.14)]";

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
    <div
      className={cn(
        "rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.86),rgba(13,16,30,0.82))] p-5 shadow-[var(--ux-shadow-soft)] backdrop-blur-xl sm:p-7",
        className
      )}
    >
      {title ? (
        <div className="mb-5 space-y-1.5">
          <h3 className="text-[20px] font-semibold tracking-[-0.03em] text-white">{title}</h3>
          {description ? (
            <p className="max-w-2xl text-[13px] leading-6 text-[var(--ux-text-secondary)]">{description}</p>
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
  required,
  tooltip,
  tooltipLabel
}: {
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
  tooltip?: string;
  tooltipLabel?: string;
}) {
  return (
    <label className="mb-2.5 inline-flex min-h-6 w-fit max-w-full items-center gap-2 align-middle text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 sm:whitespace-nowrap">
      <span className="inline">
        {children}
        {required ? <span className="ml-1.5 whitespace-nowrap text-[var(--ux-accent)]">*</span> : null}
      </span>
      {tooltip ? (
        <InfoTooltip
          content={tooltip}
          ariaLabel={tooltipLabel ?? "Подробнее о поле"}
          className="mb-[1px]"
        />
      ) : hint ? (
        <span title={hint} className="cursor-help text-white/28">
          <Info className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </label>
  );
}

export function InfoTooltip({
  content,
  ariaLabel,
  className
}: {
  content: React.ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [placement, setPlacement] = React.useState<"top" | "bottom">("top");
  const [position, setPosition] = React.useState({ top: 0, left: 0, arrowLeft: 24 });
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;

    const rect = trigger.getBoundingClientRect();
    const tooltipWidth = Math.min(380, window.innerWidth - 24);
    const estimatedHeight = 104;
    const sideOffset = 8;
    const nextPlacement =
      rect.top >= estimatedHeight + sideOffset + 12 ? "top" : "bottom";
    const unclampedLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    const left = Math.max(12, Math.min(unclampedLeft, window.innerWidth - tooltipWidth - 12));
    const top =
      nextPlacement === "top"
        ? rect.top - estimatedHeight - sideOffset
        : rect.bottom + sideOffset;
    const arrowLeft = Math.max(18, Math.min(rect.left + rect.width / 2 - left, tooltipWidth - 18));

    setPlacement(nextPlacement);
    setPosition({
      top: Math.max(12, top),
      left,
      arrowLeft
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    const onViewportChange = () => updatePosition();
    const onPointerDown = (event: PointerEvent) => {
      const trigger = triggerRef.current;
      if (trigger && event.target instanceof Node && !trigger.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-describedby={open ? panelId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={cn(
          "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white/28 transition-colors hover:text-white/62 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ux-accent)]/45",
          className
        )}
      >
        <Info className="h-4 w-4" />
      </button>
      {mounted && open
        ? createPortal(
            <div
              id={panelId}
              role="tooltip"
              className="pointer-events-none fixed z-[120] max-w-[min(380px,calc(100vw-24px))] rounded-[14px] border border-white/[0.1] bg-[#15192a] px-4 py-3 text-[12px] font-medium leading-5 text-white shadow-[0_18px_48px_-24px_rgba(0,0,0,0.85)]"
              style={{ top: position.top, left: position.left }}
            >
              <span
                aria-hidden
                className="absolute h-3 w-3 rotate-45 border-white/[0.1] bg-[#15192a]"
                style={{
                  left: position.arrowLeft - 6,
                  top: placement === "top" ? "100%" : -6,
                  borderLeftWidth: placement === "top" ? 0 : 1,
                  borderTopWidth: placement === "top" ? 0 : 1,
                  borderRightWidth: placement === "top" ? 1 : 0,
                  borderBottomWidth: placement === "top" ? 1 : 0
                }}
              />
              {content}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        CONTROL_BASE,
        "h-[52px] px-4",
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

function formatDateDisplay(value: string): string {
  const normalized = normalizeDateValue(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return "";
  return `${day}.${month}.${year}`;
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
  const normalizedValue = normalizeDateValue(value);
  const hasValue = normalizedValue.length > 0;

  const openPicker = React.useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }
    input.focus();
    input.click();
  }, []);

  return (
    <div className="min-w-0">
      <input
        {...rest}
        ref={inputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={normalizedValue}
        onChange={(event) => onChange(event.target.value)}
        className="sr-only"
      />
      <button
        type="button"
        onClick={openPicker}
        className={cn(
          CONTROL_BASE,
          "flex h-[52px] w-full min-w-0 items-center justify-center overflow-hidden px-4 text-[14px] tabular-nums",
          className
        )}
      >
        {hasValue ? (
          <span className="block min-w-0 whitespace-nowrap text-center">
            {formatDateDisplay(normalizedValue)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-3 whitespace-nowrap text-white/40">
            <span className="text-white/38">Выбрать дату</span>
            <CalendarDays className="h-[18px] w-[18px] shrink-0 text-white/40" />
          </span>
        )}
      </button>
    </div>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        CONTROL_BASE,
        "min-h-[132px] resize-y px-4 py-3.5",
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
          CONTROL_BASE,
          "h-[52px] appearance-none px-4 pr-11",
          !value && "text-[#8e8377]"
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
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e8377]"
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
    <label className="flex cursor-pointer items-start gap-3">
      <span
        className={cn(
          "mt-0.5 grid shrink-0 place-items-center rounded-[6px] border transition-all",
          size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]",
          checked
            ? "border-[var(--ux-accent)] bg-[var(--ux-accent)]"
            : "border-white/[0.14] bg-white/[0.03] hover:border-white/[0.24]"
        )}
      >
        {checked ? (
          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] text-white/88">{label}</span>
        {description ? (
          <span className="mt-1 block text-[12px] leading-5 text-white/52">{description}</span>
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
  className,
  children,
  trailing
}: {
  checked: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-stretch gap-2 rounded-[12px]",
        className
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex min-w-0 flex-1 items-center gap-2 rounded-[12px] border px-3 py-2 text-left text-[12.5px] font-medium transition-colors",
          checked
            ? "border-[var(--ux-accent)]/55 bg-[var(--ux-accent)]/12 text-white"
            : "border-white/[0.1] bg-white/[0.03] text-white/68 hover:border-[var(--ux-accent)]/35 hover:bg-white/[0.05] hover:text-white"
        )}
      >
        <span
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
            checked ? "border-[var(--ux-accent)] bg-[var(--ux-accent)]" : "border-white/25"
          )}
        >
          {checked ? <span className="h-1.5 w-1.5 rounded-full bg-[#f5f1ea]" /> : null}
        </span>
        <span className="min-w-0">{children}</span>
      </button>
      {trailing ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
    </div>
  );
}
