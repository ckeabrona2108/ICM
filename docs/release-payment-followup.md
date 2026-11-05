# Release payment follow-up

`runReleasePaymentFollowup` (`src/lib/release-payment-followup.ts`) does two things for releases that were submitted but not paid:

1. **Reconciliation.** For unconfirmed release orders from the last 14 days it asks YooKassa for the payment status. If YooKassa already charged the artist (`succeeded`) but our webhook / return page missed it, the order is applied and the release goes to moderation as paid. Releases already marked paid (for example by an admin) are skipped.
2. **Reminders.** Unpaid releases on moderation (with at least one track, not hidden) get a notification, e-mail and push "Ваш релиз ждёт оплаты" 1 hour, 24 hours and 3 days after they started waiting for payment. The link opens `/dashboard/releases/<id>?pay=1`, which starts a fresh YooKassa payment right away. Releases that waited more than 7 days without any reminder are not reminded. Progress is stored in `release.roles.paymentReminders`.

Reconciliation also settles an order whose release an admin already marked paid: the release keeps its status (an approved release is not sent back to moderation); only the order is confirmed, marked `completed` and recorded as the release's `paymentUsage`.

Before a new payment is created, `settleOpenReleaseOrders` (`src/lib/release-payment-guard.ts`) checks the release's open orders from the last day: a payment YooKassa already took is applied instead of charging again, and one still being confirmed (under 3 minutes old) blocks a second payment. A paid release (including one returned for changes or sent to repeat moderation) is never charged again.

## Scheduling

Since 2026-11-05 the production server runs the follow-up itself every 10 minutes (`src/instrumentation.ts`), so no external scheduler is needed. Set `DISABLE_IN_APP_CRON=1` to turn that off if an external scheduler calls the endpoint instead.

Alternatively, set `CRON_SECRET` in the app environment and call the endpoint every 10–15 minutes:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://www.icecreammusic.net/api/cron/release-payments
```

Or run the worker on a host with the repository and `DATABASE_URL` / `YOOKASSA_*` configured:

```bash
RELEASE_PAYMENT_FOLLOWUP_WORKER=1 node --import tsx scripts/workers/release-payment-followup.ts
```
