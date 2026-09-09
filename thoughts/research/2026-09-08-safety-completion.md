# Safety completion research

Continuation of the existing audit remediation specification and plan. Existing uncommitted work is retained.

## Findings

- Payout completion reads state outside its mutation transaction; concurrent rejection/processing can overwrite terminal state.
- Release submission has no durable request receipt. Retry can re-evaluate lifecycle, quota and payment after a successful but lost response.
- Copy seeding retains source UPC. Internal approval is currently displayed as publication.
- Finance readers suppress missing-table failures; verification maps unavailable storage to not-signed.

## Recommendation

Use conditional transactional payout transitions with a unique settlement identifier; durable user-scoped submission receipts and transaction locking; fresh UPC for separate copies; publication only from verified DSP evidence; explicit unavailable states with retry controls. Retain existing repository patterns and dependencies.

PostgreSQL documents re-evaluation of UPDATE predicates after competing transactions in Read Committed: https://www.postgresql.org/docs/18/transaction-iso.html . Prisma documents unique constraints for idempotent APIs and transaction conflict handling: https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions . Verify actual behavior using the installed PostgreSQL and Prisma versions in a disposable local database.
