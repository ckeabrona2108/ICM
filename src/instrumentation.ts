/**
 * Runs once when the Next.js server starts. In production it starts the release payment
 * follow-up on a timer inside the app (YooKassa reconciliation + 1h / 24h / 3d payment reminders),
 * so it no longer depends on an external cron that may not be configured.
 * Set DISABLE_IN_APP_CRON=1 to turn it off (e.g. when an external scheduler calls /api/cron/release-payments).
 */
export async function register() {
  // The import must sit inside this check so the Node-only code is left out of the edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startInAppSchedules } = await import("./instrumentation-node");
    startInAppSchedules();
  }
}
