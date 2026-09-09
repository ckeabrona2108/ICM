# Audit remediation: finance and release safety

## Problem

The product audit found that payout creation writes the legacy `payouts` table while the
balance calculation can read `payoutRequest`; this makes the displayed reservation and
the request processed by admins diverge. A repeated release-submit request can also
re-run payment selection. Several server routes do not consistently enforce lifecycle,
contract, verification, or audio-file rules.

## Goal

Make financial balances, payout requests, and payout completion coherent; ensure a
release submission is safe to retry; and move every critical release rule to the server.

## Scope

1. Make `payouts` the canonical payout-request record, extend it with the request
   lifecycle and full requisites, and remove runtime preference for the obsolete
   `payoutRequest` model.
2. Create the debit transaction exactly when an administrator marks a payout paid.
   Pending payout requests reserve funds and rejected requests release that reservation.
3. Add a durable release-submit idempotency boundary and enforce lifecycle,
   approved-contract/verification, and uploaded-audio requirements on the server.
4. Make an approved/distributed edit create a separate release with a new UPC; retain
   ordinary metadata edits as a separate, explicitly-defined follow-up only if DSP
   update integration is added.
5. Correct user-facing lifecycle and data-loading states after the safety changes.

## Acceptance criteria

- A payout request, its admin status, the reserved balance, and the resulting debit
  all refer to the same `payouts` record.
- Every validated payout requisite is visible to an administrator without relying on
  legacy flattened columns.
- Repeating the same release-submit HTTP request returns the first completed result
  and does not create another charge, consume another partner code, or alter a plan.
- Draft save and submit reject transitions that `canEditRelease` disallows.
- Submission is rejected unless the server can prove an approved contract/verification
  and a stored audio object for each audio track.
- A copy of an accepted or distributed release gets a fresh UPC before moderation;
  the original record remains unchanged.
- UI says "published" only on a DSP delivery-confirmed state, and loading failures are
  rendered as failures rather than zero financial or verification data.

## Constraints

- Existing migrations and uncommitted workspace changes must be preserved.
- No data-destructive migration or production deployment is part of this task.
- The remediation must remain compatible with the canonical `icecream` schema.

## Non-goals

- DSP delivery webhook integration, reconciliation of historical payout records, and
  a redesign of the release wizard are separate follow-up deliveries.
