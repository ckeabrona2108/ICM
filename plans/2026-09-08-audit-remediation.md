# Audit remediation implementation plan

Status: in progress  
Source: `docs/product-audit-2026-09-08.md` and `specs/2026-09-08-audit-remediation.md`

## Decision record

The canonical payout request will be `icecream.payouts`, because creation, the admin
queue, and the deployed canonical-schema migration already use it. The stale
`payoutRequest` Prisma model must not be used as a preferred balance source. `payouts`
will hold the request/reservation and `transaction` will remain the immutable settlement
ledger: a `PAYOUT` debit is written atomically when a request becomes `PAID`.

For retries, the server will use a client-supplied idempotency key stored with a unique
scope of user plus operation. The database constraint, rather than an in-process lock,
is the concurrency boundary. Prisma documents compound unique constraints for unique
lookups/upserts and recommends handling concurrent transaction conflicts explicitly:
https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-composite-ids-and-constraints
and https://www.prisma.io/docs/orm/prisma-client/queries/transactions.

The versioning decision is deliberately conservative: a copy made from an approved or
distributed release is a new release and receives a new UPC. Reusing a UPC is only safe
when an eventual DSP-update workflow owns a stable external-release identity, which the
current product does not have.

## Phases

### 1. Financial source of truth — P0

1. Inspect the canonical migration and every payout reader/writer.
2. Add an additive migration for `payouts`: lifecycle status, method, JSON requisites,
   timestamps, and indexes. Do not remove legacy columns.
3. Point the request route, admin list/actions, notification list, and balance service
   at the same model.
4. On transition to `PAID`, write one `Transaction(PAYOUT)` in the same serializable
   transaction; make a repeated transition harmless.
5. Add focused tests for request reservation, requisites, paid debit, rejected release,
   and old rows.

### 2. Retry-safe submission and policy gates — P1

1. Add an idempotency record/key and return the persisted response for a matching retry.
2. Apply `canEditRelease` before draft mutation and before submit mutation.
3. Resolve contract/verification through the authoritative service and fail closed on
   missing or unavailable storage.
4. Require a resolved uploaded audio asset, not only client-provided metadata.
5. Add route-level tests for repeat requests, blocked lifecycle, verification, and audio.

### 3. Release version rule — P1

1. Trace the edit-copy path and copy a release only when its lifecycle permits it.
2. Generate a new UPC for the child release; record `sourceReleaseId`/version metadata
   so moderation can explain the relationship.
3. Test that normal edits do not mutate accepted originals and that approval does not
   conflict on UPC.

### 4. Honest states and operational UI — P2

1. Add a distinct DSP-confirmed lifecycle state and show "published" only for it.
2. Render explicit unavailable/error states in the dashboard data loader.
3. Replace technical partner codes with user-facing store groups and keep codes server-side.

### 5. Verification and release preparation

Run focused tests in every phase, then typecheck, lint, and the project test suite.
Prepare a data-reconciliation dry-run for historical payout requests. Deployment and
backfill execution require a separate explicit production decision.

## Challenge log

### Does this solve the audit findings?

Each P0/P1 finding has an owning phase and an acceptance criterion. P2 presentation
issues follow only after the financial and submission invariants are protected.

### Alternatives considered

1. Keep two payout tables and mirror writes. Rejected: dual writes make retries and
   migration failures create the same inconsistency again.
2. Switch all code back to `payoutRequest`. Rejected: the canonical schema migration
   has removed that table, while the deployed request/admin paths use `payouts`.
3. Idempotency only in memory. Rejected: it fails across process restarts and concurrent
   instances; a unique database key is required.

### Boundary

No deployment or destructive backfill is included. Historical reconciliation is a
dry-run artifact after the new code is verified.
