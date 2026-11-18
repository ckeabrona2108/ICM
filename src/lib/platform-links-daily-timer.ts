import { runDailyPlatformLinkJob } from "@/lib/platform-link-discovery-service";
import { prisma } from "@/lib/prisma";
import { runReleaseTipsJob } from "@/lib/release-tips";

const CHECK_EVERY_MS = 15 * 60 * 1000;
/** Moscow hour the daily search runs at (quiet time for the site). */
const RUN_AT_MOSCOW_HOUR = 6;
/** Moscow hour the post-release tips go out (daytime, not at night). */
const TIPS_AT_MOSCOW_HOUR = 12;

const globalForTimer = globalThis as unknown as { platformLinksDailyTimer?: NodeJS.Timeout };

let running = false;
let lastRunDay: string | null = null;
let tipsRunning = false;
let lastTipsDay: string | null = null;

async function tickTips(day: string, hour: number) {
  if (tipsRunning || hour !== TIPS_AT_MOSCOW_HOUR || lastTipsDay === day) return;
  tipsRunning = true;
  lastTipsDay = day;
  try {
    console.info("[release-tips]", await runReleaseTipsJob(prisma));
  } catch (error) {
    console.error("[release-tips] run failed", error);
  } finally {
    tipsRunning = false;
  }
}

function moscowParts(date: Date): { day: string; hour: number } {
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

async function tick() {
  const { day, hour } = moscowParts(new Date());
  void tickTips(day, hour);
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
  console.info(
    `[platform-links-daily] in-app schedule started, daily at ${RUN_AT_MOSCOW_HOUR}:00 Moscow (release tips at ${TIPS_AT_MOSCOW_HOUR}:00)`
  );
}
