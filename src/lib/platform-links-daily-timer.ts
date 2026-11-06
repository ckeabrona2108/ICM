import { runDailyPlatformLinkJob } from "@/lib/platform-link-discovery-service";

const CHECK_EVERY_MS = 15 * 60 * 1000;
/** Moscow hour the daily search runs at (quiet time for the site). */
const RUN_AT_MOSCOW_HOUR = 6;

const globalForTimer = globalThis as unknown as { platformLinksDailyTimer?: NodeJS.Timeout };

let running = false;
let lastRunDay: string | null = null;

function moscowParts(date: Date): { day: string; hour: number } {
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

async function tick() {
  const { day, hour } = moscowParts(new Date());
  if (running || hour !== RUN_AT_MOSCOW_HOUR || lastRunDay === day) return;
  running = true;
  lastRunDay = day;
  try {
    const result = await runDailyPlatformLinkJob();
    console.info("[platform-links-daily]", result);
  } catch (error) {
    console.error("[platform-links-daily] run failed", error);
  } finally {
    running = false;
  }
}

/** Starts the daily release link search inside the app, once per server process. */
export function startPlatformLinksDailyTimer() {
  if (globalForTimer.platformLinksDailyTimer) return;
  const timer = setInterval(() => void tick(), CHECK_EVERY_MS);
  timer.unref?.();
  globalForTimer.platformLinksDailyTimer = timer;
  console.info(`[platform-links-daily] in-app schedule started, daily at ${RUN_AT_MOSCOW_HOUR}:00 Moscow`);
}
