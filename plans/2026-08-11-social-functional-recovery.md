# Plan: social/community functional recovery

Date: 2026-08-11

## Constraints

- Do not change release creation/edit/review/delivery functionality.
- Do not redesign or visually refactor any surface.
- Preserve unrelated dirty-worktree changes.
- Every defect needs a failing reproduction/regression test before its fix where practical.
- Runtime status is BLOCKED, not FIXED, when an isolated seeded environment is unavailable.

## Phase 1 — P0 safety and contract baseline

1. Add regression tests for active feed wiring, multi-media DTO preservation, comment deleted-counter semantics, reply parent propagation, and migration compatibility checks.
2. Repair the social migration chain with backwards-safe SQL and no reset.
3. Unify the active feed/community data contract without changing layout.
4. Make comment visibility/count semantics consistent and move root pagination to the database.

## Phase 2 — P1 core behavior

1. Repair true feed/detail pagination and query-before-hydration behavior.
2. Repair personal/producer follow read models and producer type persistence/rendering.
3. Repair DM delete-for-me SQL, active unread, message notification isolation, and bounded polling payloads.
4. Repair notification total unread count and self-action suppression.
5. Repair social upload binding/cleanup and missing-media states.
6. Implement duration-qualified, race-safe, actor-aware play accounting and connect active release cards.
7. Make dashboard and public feed use the same ranking source.

## Phase 3 — P2 resilience

1. Make reaction/follow toggles idempotent under rapid/concurrent requests and add optimistic rollback tests.
2. Add notification rollback and targeted update delivery.
3. Correct profile totals/pagination and large avatar payload handling.
4. Cover not-found and unavailable media states.

## Verification gates per phase

1. Targeted regression tests.
2. Social test suite.
3. Typecheck and lint.
4. Full test suite and build.
5. Isolated A/B/C browser scenarios, hard refresh, adjacent-flow checks.
6. Query/payload/duration measurements before and after.
7. Independent code review and security/authorization review.

## Stop condition

All matrix rows are PASS/FIXED, or explicitly PARTIAL/BLOCKED with an environment blocker and no safe independent work remaining.
