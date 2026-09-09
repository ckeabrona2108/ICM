# Community Remediation Report

## Executive Summary

Remediation is in progress under phased release gates. Phase 0 is verified on an isolated PostgreSQL/storage/browser environment. Phase 1 and Phase 2 must pass their own A/B/C browser gates before a production-ready verdict can be issued.

## Phase 0

### Storage authorization

- Added a centralized, deny-by-default storage key policy for public, private, user-owned, and system-owned objects.
- Generic PUT and relay writes now validate the authenticated owner, namespace, size, MIME type, extension, and file signature before storage access.
- Private reads authorize the requested and fallback-resolved keys before probing or signing storage objects.
- Route-level browser coverage verifies cross-user write denial, private guest denial, owner reads, public reads, traversal, double encoding, and owner-confusion attempts.

### Migration parity and isolated environment

- Reconciled the legacy migration history with the canonical `icecream` Prisma schema without using `db push`.
- Added the missing `playlist_placements` migration and forward-only schema parity repairs.
- Added a marker-owned disposable PostgreSQL launcher, deterministic A/B/C social seed, schema parity assertions, and an existing-canonical upgrade rehearsal.
- Fresh PostgreSQL 16 verification applied all 45 migrations, generated Prisma Client, reported no schema diff, seeded A/B/C, and cleaned the owned runtime.
- Production deployment still requires a read-only duplicate-key preflight before analytics unique indexes and confirmation of the real `_prisma_migrations` ledger before baselining the canonical bridge.

### Browser foundation and public navigation

- Added tracked Playwright configuration, isolated A/B/C authenticated contexts, disposable storage, and guarded local-only launch scripts.
- Public author links now open `/artists/<slug>` and public card actions open canonical `/feed/<id>` permalinks without an authentication redirect.
- Authentication prompts remain limited to write interactions.

### Moderation and safety

- Added persisted reports, bilateral blocks, per-viewer hidden content, and muted accounts.
- Backend policy enforcement covers feed, detail, profiles, comments, replies, follows, reactions, direct messages, and collaboration contact.
- Blocking removes follow edges and prevents future interactions; unblocking does not restore follows.

## Phase 1

In progress.

## Phase 2

Not started. The Phase 1 gate must pass first.

## Bugs Closed

| Bug | Before | Fix | Verification |
| --- | --- | --- | --- |
| COMM-001 | Generic object routes allowed cross-user writes and private reads by known key. | Central storage authorization and bounded upload validation. | Storage unit/route suites and isolated browser IDOR scenarios pass. |
| COMM-002 | Prisma schema and migration history could not provision a fresh canonical database; `playlist_placements` had no migration. | Canonical bridge, missing table migration, parity migration, and guarded migration tooling. | Fresh 45-migration run and existing-canonical rehearsal both have zero Prisma diff. |
| COMM-003 | No report, block, mute, or hide graph. | Persisted safety models, shared policy enforcement, APIs, and feed controls. | Focused safety tests and isolated A/B/C browser scenarios pass. |
| COMM-012 | Public read actions redirected guests to authentication-only dashboard surfaces. | Canonical public profile and permalink navigation. | Navigation unit tests and isolated browser regressions pass. |

## Migrations

- `20260718100000_baseline_canonical_icecream_schema`
- `20260819110000_add_playlist_placements`
- `20260819120000_add_social_safety_foundation`
- `20260819123000_add_social_feed_preferences`
- `20260819130000_reconcile_schema_parity`

Migration verification used only marker-owned disposable PostgreSQL clusters. No shared database was mutated.

## Security Verification

- Cross-user generic PUT: denied before storage write.
- Cross-user relay upload: denied before body/storage processing.
- Guest private object read: denied before storage probing.
- Owner private object read: allowed.
- Explicit public media read: allowed; write remains owner-only.
- Traversal, double-encoding, unusual separators, system-private roots, and foreign-owner identity confusion: denied.
- Bilateral block bypass attempts against social mutations: denied.

## A/B/C E2E Results

Phase 0 isolated run: **14/14 passed**. It covered deterministic A/B/C authentication, public navigation, guest mutation prompts, reports, hide/mute, bilateral block/unblock, and storage authorization.

Phase 1 complete social-loop scenarios are pending.

## Concurrency Results

Pending Phase 1 gate.

## Remaining Issues

- Phase 1 social-loop reliability, editing, comment reactions, audience enforcement, durable notification delivery, direct permalink completeness, exact counters, and media reference safety are not yet release-gated.
- Phase 2 normalized music activity, consent, release deduplication, playlist placement feed events, and player continuity are not yet implemented.
- Historical AI references stored under the legacy public-compatible `uploads/` namespace need a separate reference-aware migration; new private objects have an owner-only namespace.
- The production database migration ledger and duplicate-key preflight have not been inspected or mutated by this task.

## Test Commands

```text
SOCIAL_TEST_DB_INSTANCE=root-final4 SOCIAL_TEST_DB_PORT=55438 E2E_BASE_URL=http://127.0.0.1:3113 npm run -s test:e2e:community
```

Result: 45 migrations applied, deterministic A/B/C seed passed, Playwright 14/14 passed, disposable runtime removed.

Additional Phase 0 evidence:

```text
npm run -s typecheck
npx prisma validate
node --import tsx --test <targeted Community/storage/safety suites>
```

## Files Changed

The main Phase 0 changes are in the storage policy/routes, social safety services/routes/UI, public feed navigation, Prisma migrations/schema, disposable database tooling, deterministic seed, and tracked Playwright suite. The final file inventory will be recorded after Phase 2.

## Final Verdict

```text
NO
```

Phase 0 is verified, but the mandatory Phase 1 and Phase 2 gates are still open.
