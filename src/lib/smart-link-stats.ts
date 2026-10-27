export type SmartLinkDeltaTone = "up" | "down" | "flat";

export interface SmartLinkDelta {
  text: string;
  tone: SmartLinkDeltaTone;
}

/** Percent change of a counter between two equal periods, e.g. the last 30 days vs the 30 before them. */
export function getSmartLinkCountDelta(current: number, previous: number): SmartLinkDelta | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return { text: "новое", tone: "up" };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { text: "0%", tone: "flat" };
  return { text: `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`, tone: percent > 0 ? "up" : "down" };
}

/** Change of a rate (conversion) between two periods in percentage points. */
export function getSmartLinkRateDelta(
  current: { hits: number; total: number },
  previous: { hits: number; total: number }
): SmartLinkDelta | null {
  if (current.total === 0 || previous.total === 0) return null;
  const points = Math.round((current.hits / current.total) * 100) - Math.round((previous.hits / previous.total) * 100);
  if (points === 0) return { text: "0 п.п.", tone: "flat" };
  return { text: `${points > 0 ? "+" : "−"}${Math.abs(points)} п.п.`, tone: points > 0 ? "up" : "down" };
}
