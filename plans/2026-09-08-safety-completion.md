# Safety completion execution

Scope: the five explicitly requested continuations of `2026-09-08-audit-remediation.md`.

1. Ledger: conditional state transitions, transactional one-time debit, authorization/validation/retry/concurrent route tests, disposable migration rehearsal with representative old rows.
2. Submit: durable user/key receipt, payload mismatch rejection, atomic release/payment/quota effects, persisted client retry key and response replay tests.
3. Copies: clear inherited UPC, preserve source and recording identity, generate fresh release UPC through existing allocation.
4. Status: internal approval/distribution/date cannot independently imply publication; inspect trusted DSP evidence and avoid fabricated confirmation.
5. Loading: unavailable finance and verification data stay unavailable, with explicit error/retry presentation and fail-closed actions.

Alternatives rejected: process-local deduplication cannot survive restarts; mirroring financial sources cannot guarantee consistency; treating absent reads as zeros conceals operational failures. Existing specification supplies acceptance criteria; no unrelated redesign or deployment.

Implementation is delegated by non-overlapping responsibility. Root owns integration, complete test/type/lint gates, migration parity after the ledger fixture rehearsal, and independent final review. No production database changes or deployment. Existing dirty changes are preserved.

Status: implementation and targeted regression verification in progress.
