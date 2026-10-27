"use client";

import * as React from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  CreditCard,
  FileSignature,
  Pencil,
  RadioTower,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { ReleaseTimelineStep, ReleaseTimelineStepId } from "@/lib/release-timeline-state";

const STEPS = [
  { id: 1, label: "Черновик" },
  { id: 2, label: "На модерации" },
  { id: 3, label: "Принят" }
] as const;

const STEP_ICONS: Record<ReleaseTimelineStepId, LucideIcon> = {
  draft: Pencil,
  unpaid: CreditCard,
  verification: FileSignature,
  moderation: ShieldCheck,
  changes_required: AlertTriangle,
  approved: Check,
  distributed: RadioTower,
  dsp_confirmed: RadioTower,
  archived: Archive
};

// Финальные шаги, когда релиз уже на площадках, подсвечиваем зелёным.
const LIVE_STEPS = new Set<ReleaseTimelineStepId>(["distributed", "dsp_confirmed"]);

/** Stepper with an icon per stage and the label under it (in the spirit of 21st.dev steppers).
 * Legacy режим: 1-3. Новый режим: steps + activeIndex. */
export function ReleaseModerationStepper({
  currentStep,
  steps,
  activeIndex
}: {
  currentStep?: 1 | 2 | 3;
  steps?: ReleaseTimelineStep[];
  activeIndex?: number;
}) {
  const reduce = useReducedMotion();
  const renderedSteps: Array<{ key: string; label: string; stepId: ReleaseTimelineStepId | null }> =
    steps && steps.length > 0
      ? steps.map((step) => ({ key: step.id, label: step.label, stepId: step.id }))
      : STEPS.map((step) => ({ key: String(step.id), label: step.label, stepId: null }));
  const fallbackIdx = currentStep ? Math.max(0, Math.min(renderedSteps.length - 1, currentStep - 1)) : 0;
  const resolvedActiveIdx = Math.max(
    0,
    Math.min(renderedSteps.length - 1, activeIndex ?? fallbackIdx)
  );
  const allDone = resolvedActiveIdx >= renderedSteps.length - 1;

  return (
    <div className="mt-3 rounded-2xl border border-white/[0.07] bg-[#13151d] px-3 py-3 sm:px-5">
      <ol className="flex w-full items-start" aria-label="Этапы релиза">
        {renderedSteps.map((step, i) => {
          const completed = allDone || i < resolvedActiveIdx;
          const active = !allDone && i === resolvedActiveIdx;
          const isLast = i === renderedSteps.length - 1;
          const live = completed && isLast && step.stepId != null && LIVE_STEPS.has(step.stepId);
          const warning = step.stepId === "changes_required" && (active || completed);
          const Icon = step.stepId ? STEP_ICONS[step.stepId] : Check;

          return (
            <li
              key={step.key}
              className={cn("flex min-w-0 items-start", !isLast && "flex-1")}
              aria-current={active ? "step" : undefined}
            >
              <div className="flex w-[72px] shrink-0 flex-col items-center text-center sm:w-[96px]">
                <span
                  className={cn(
                    "relative grid h-8 w-8 place-items-center rounded-full transition-colors",
                    completed && !live && !warning && "bg-[#7b61ff] text-white shadow-[0_0_14px_-3px_rgba(123,97,255,0.9)]",
                    live && "bg-emerald-500 text-white ring-[6px] ring-emerald-500/15",
                    warning && "bg-amber-400 text-[#1a1300] ring-4 ring-amber-400/20",
                    active && !warning && "bg-white text-[#13141a] ring-4 ring-[#7b61ff]/30",
                    !completed && !active && "border border-white/15 text-white/35"
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                  {active && !reduce ? (
                    <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-[#7b61ff]/25" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "mt-1.5 line-clamp-2 text-[11.5px] font-semibold leading-tight sm:text-[12px]",
                    completed && "text-white/80",
                    live && "text-emerald-300",
                    active && "text-white",
                    !completed && !active && "text-white/40",
                    // На телефоне подпись остаётся только у текущего шага.
                    !active && "hidden md:block"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {!isLast ? (
                <span className="relative mt-[15px] h-[2px] min-w-3 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <motion.span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      i === renderedSteps.length - 2 && allDone && renderedSteps[i + 1]?.stepId != null &&
                        LIVE_STEPS.has(renderedSteps[i + 1].stepId as ReleaseTimelineStepId)
                        ? "bg-[linear-gradient(90deg,#7b61ff,#22c55e)]"
                        : "bg-[#7b61ff]"
                    )}
                    initial={false}
                    animate={{ width: completed ? "100%" : "0%" }}
                    transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
