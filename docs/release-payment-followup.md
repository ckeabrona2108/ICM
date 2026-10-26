# Release payment follow-up

`runReleasePaymentFollowup` (`src/lib/release-payment-followup.ts`) does two things for releases that were submitted but not paid:

1. **Reconciliation.** For unconfirmed release orders from the last 14 days it asks YooKassa for the payment status. If YooKassa already charged the artist (`succeeded`) but our webhook / return page missed it, the order is applied and the release goes to moderation as paid. Releases already marked paid (for example by an admin) are skipped.
2. **Reminders.** Unpaid releases on moderation (with at least one track, not hidden) get a notification, e-mail and push "Ваш релиз ждёт оплаты" 1 hour, 24 hours and 3 days after they started waiting for payment. The link opens `/dashboard/releases/<id>?pay=1`, which starts a fresh YooKassa payment right away. Releases that waited more than 7 days without any reminder are not reminded. Progress is stored in `release.roles.paymentReminders`.

## Scheduling

Set `CRON_SECRET` in the app environment and call the endpoint every 10–15 minutes:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://www.icecreammusic.net/api/cron/release-payments
```

Or run the worker on a host with the repository and `DATABASE_URL` / `YOOKASSA_*` configured:

```bash
RELEASE_PAYMENT_FOLLOWUP_WORKER=1 node --import tsx scripts/workers/release-payment-followup.ts
```
