// The counter number is public. Production counts by default; local dev only when the env var is set.
export const YANDEX_METRIKA_ID = Number(
  process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || (process.env.NODE_ENV === "production" ? "113863145" : "")
);

/**
 * Sends a Yandex Metrika goal. The goal must also exist in the counter's settings as a
 * "JavaScript event" with the same identifier, or Metrika drops it.
 */
export function reachGoal(goal: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !Number.isFinite(YANDEX_METRIKA_ID) || YANDEX_METRIKA_ID <= 0) return;
  try {
    window.ym?.(YANDEX_METRIKA_ID, "reachGoal", goal, params);
  } catch {
    // Analytics must never break the page.
  }
}
