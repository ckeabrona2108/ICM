# Social notification outbox

Community mutations enqueue durable notification events in the same database transaction as the mutation. Request handlers attempt delivery after commit; failed or interrupted deliveries remain retryable.

Run one guarded retry batch from a scheduler or worker host:

```bash
SOCIAL_OUTBOX_WORKER=1 SOCIAL_OUTBOX_BATCH_SIZE=50 \
  node --import tsx scripts/workers/retry-social-notifications.ts
```

Schedule the command at least once per minute. The worker processes at most 200 events per invocation, reclaims processing rows whose five-minute lease expired, and exits non-zero only when the batch query itself fails. Individual delivery failures are recorded on the outbox row with exponential backoff.

The worker uses the normal `DATABASE_URL`; never point it at a database other than the intended environment. For local verification, use the disposable database launcher and an explicit `SOCIAL_TEST_DATABASE_URL` instead of an ambient or shared database.

Dashboard notification persistence is idempotent by deterministic event ID. Push delivery is also tracked per outbox event and subscription endpoint. A process crash after the push provider accepts a message but before the delivery ledger is committed remains an unavoidable at-least-once delivery window; downstream clients should collapse repeated pushes by the stable event tag.
