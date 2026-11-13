"use client";

import * as React from "react";

import type { StepId } from "./wizard-context";

/** Label of a step ("Шаг 3"); an edited copy shows fewer steps, so numbers depend on the route. */
export const StepNumberContext = React.createContext<((step: StepId) => string | null) | null>(null);

export function useStepNumber(step: StepId, fallback: string): string {
  const resolve = React.useContext(StepNumberContext);
  return resolve?.(step) ?? fallback;
}
