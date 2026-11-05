import { prisma } from "@/lib/prisma";
import { runReleasePaymentFollowup } from "@/lib/release-payment-followup";

const INTERVAL_MS = 10 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;

const globalForTimer = globalThis as unknown as { releasePaymentFollowupTimer?: NodeJS.Timeout };

let running = false;

async function runOnce() {
  if (running) return;
  running = true;
  try {
    const result = await runReleasePaymentFollowup({ prisma });
    if (result.reconciledOrders.length || result.remindersSent.length || result.errors.length) {
      console.info("[release-payment-followup]", {
        reconciledOrders: result.reconciledOrders,
        remindersSent: result.remindersSent.length,
        errors: result.errors
      });
    }
  } catch (error) {
    console.error("[release-payment-followup] run failed", error);
  } finally {
    running = false;
  }
}

/** Starts the in-app schedule once per server process. */
export function startReleasePaymentFollowupTimer() {
  if (globalForTimer.releasePaymentFollowupTimer) return;
  setTimeout(() => void runOnce(), FIRST_RUN_DELAY_MS).unref?.();
  const timer = setInterval(() => void runOnce(), INTERVAL_MS);
  timer.unref?.();
  globalForTimer.releasePaymentFollowupTimer = timer;
  console.info("[release-payment-followup] in-app schedule started, every 10 minutes");
}
