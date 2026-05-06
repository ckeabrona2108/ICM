"use client";

import * as React from "react";
import { Check, Clock } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { ReleaseTimelineStep } from "@/lib/release-timeline-state";

const STEPS = [
  { id: 1, label: "Черновик" },
  { id: 2, label: "На модерации" },
  { id: 3, label: "Опубликован" }
] as const;

/** Legacy режим: 1-3. Новый режим: steps + activeIndex. */
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
    <div className="mt-3 border-t border-white/[0.05] pt-3">
      <div className="flex w-full items-start">
        {renderedSteps.map((step, i) => {
          const completed = allDone || i < resolvedActiveIdx;
          const active = !allDone && i === resolvedActiveIdx;
          const pending = !completed && !active;
          const nextConnectorProgress = allDone ? 1 : i < resolvedActiveIdx ? 1 : 0;

          return (
            <React.Fragment key={step.id}>
              <div className="flex w-[58px] shrink-0 flex-col items-center sm:w-[68px]">
                <StepNode
                  stepNum={step.id}
                  completed={completed}
                  active={active}
                  pending={pending}
                  reduce={reduce}
                />
                <p
                  className={cn(
                    "mt-1.5 max-w-[58px] text-center text-[9px] leading-[1.25] sm:max-w-[68px] sm:text-[11px]",
                    completed && "font-semibold text-sky-300",
                    active && "font-semibold text-white/90",
                    pending && "text-white/52"
                  )}
                >
                  {step.label}
                </p>
              </div>
              {i < renderedSteps.length - 1 ? (
                <Connector
                  progress={nextConnectorProgress}
                  reduce={reduce}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function StepNode({
  stepNum,
  completed,
  active,
  pending,
  reduce
}: {
  stepNum: number;
  completed: boolean;
  active: boolean;
  pending: boolean;
  reduce: boolean | null;
}) {
  return (
    <motion.div
      initial={false}
      animate={
        reduce
          ? {}
          : active
            ? { scale: [1, 1.04, 1] }
            : { scale: 1 }
      }
      transition={
        active && !reduce
          ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.2 }
      }
      className={cn(
        "relative grid h-7 w-7 shrink-0 place-items-center rounded-full border sm:h-9 sm:w-9",
        completed &&
          "border-sky-300 bg-sky-500 text-white shadow-[0_0_12px_-2px_rgba(56,189,248,0.65)]",
        active && "border-white/35 bg-white/[0.08] text-white",
        pending && "border-white/[0.10] bg-white/[0.02] text-white/32"
      )}
    >
      {completed ? (
        <motion.span
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 24 }}
        >
          <Check className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" strokeWidth={2.6} />
        </motion.span>
      ) : active ? (
        <Clock className="h-3.5 w-3.5 text-sky-200/90 sm:h-4.5 sm:w-4.5" strokeWidth={2.1} />
      ) : (
        <span className="text-[10px] font-semibold tabular-nums sm:text-[12px]">{stepNum}</span>
      )}
      {active && !reduce ? (
        <span className="pointer-events-none absolute inset-0 rounded-full bg-sky-400/20 animate-ping opacity-60" />
      ) : null}
    </motion.div>
  );
}

function Connector({
  progress,
  reduce
}: {
  progress: number;
  reduce: boolean | null;
}) {
  return (
    <div className="relative mx-1 mt-[13px] h-[2px] min-w-[6px] flex-1 self-start sm:mt-[17px] sm:h-[2px]">
      <div className="absolute inset-0 rounded-full bg-white/[0.10]" />
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full bg-sky-300"
        initial={false}
        animate={{
          width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`
        }}
        transition={{
          width: { duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }
        }}
      />
    </div>
  );
}
