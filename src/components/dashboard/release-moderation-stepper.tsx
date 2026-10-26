"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { ReleaseTimelineStep } from "@/lib/release-timeline-state";

const STEPS = [
  { id: 1, label: "Черновик" },
  { id: 2, label: "На модерации" },
  { id: 3, label: "Принят" }
] as const;

/** Compact stepper with checkmarks (in the spirit of Origin UI "Stepper with checkmarks").
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
  const renderedSteps =
    steps && steps.length > 0
      ? steps.map((step, index) => ({ id: index + 1, label: step.label }))
      : STEPS;
  const fallbackIdx = currentStep ? Math.max(0, Math.min(renderedSteps.length - 1, currentStep - 1)) : 0;
  const resolvedActiveIdx = Math.max(
    0,
    Math.min(renderedSteps.length - 1, activeIndex ?? fallbackIdx)
  );
  const allDone = resolvedActiveIdx >= renderedSteps.length - 1;

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 sm:px-4">
      <ol className="flex w-full items-center gap-2" aria-label="Этапы релиза">
        {renderedSteps.map((step, i) => {
          const completed = allDone || i < resolvedActiveIdx;
          const active = !allDone && i === resolvedActiveIdx;
          const isLast = i === renderedSteps.length - 1;

          return (
            <li
              key={step.id}
              className={cn("flex min-w-0 items-center gap-2", !isLast && "flex-1")}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums transition-colors",
                  completed && "bg-[#7b3df5] text-white shadow-[0_0_12px_-3px_rgba(123,61,245,0.9)]",
                  active && "bg-white text-[#13141a] ring-4 ring-[#7b3df5]/25",
                  !completed && !active && "border border-white/15 text-white/40"
                )}
              >
                {completed ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : step.id}
                {active && !reduce ? (
                  <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-[#7b3df5]/30" />
                ) : null}
              </span>
              <span
                className={cn(
                  "truncate whitespace-nowrap text-[12px] font-semibold",
                  completed && "text-white/80",
                  active && "text-white",
                  !completed && !active && "text-white/40",
                  // On phones only the current step keeps its label, the rest stay as dots.
                  !active && "hidden md:inline"
                )}
              >
                {step.label}
              </span>
              {!isLast ? (
                <span className="relative h-[2px] min-w-3 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full bg-[#7b3df5]"
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
