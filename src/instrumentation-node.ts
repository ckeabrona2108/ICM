import { startReleasePaymentFollowupTimer } from "@/lib/release-payment-followup-timer";

export function startInAppSchedules() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.DISABLE_IN_APP_CRON === "1") return;
  startReleasePaymentFollowupTimer();
}
