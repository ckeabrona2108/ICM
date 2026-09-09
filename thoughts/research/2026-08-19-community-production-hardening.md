# Community production hardening — research

Date: 2026-08-19
Scope: Phase 0 blockers from `COMMUNITY_AUDIT.md` and `COMMUNITY_AUDIT_CHECKLIST.md`

## Evidence boundary

- The configured/shared database was not mutated.
- Repository inspection, git history inspection, binary/tool availability checks and pure test inspection were read-only.
- The worktree is already heavily modified and contains the current Community implementation mostly as untracked files. Existing changes must be preserved and integrated in place.

## Storage authorization (COMM-001)

The P0 remains present.

- `src/app/api/uploads/object/[...key]/route.ts` authenticates `PUT`, but authorizes only the syntax of a key. It reads the full body and writes any accepted path.
- The same route performs object lookup/stream/presign work for `GET` before proving that the requester may read the key.
- `src/app/api/uploads/relay/route.ts` accepts an arbitrary sanitized key, trusts the caller MIME type and buffers an unbounded body.
- `src/lib/storage-object-access.ts` knows some public catalog roots, but is not a complete access policy and is not used as a deny gate.

Namespace compatibility map:

- Public user-owned: `artist-social/<userId>/...`, `artist-profiles/<userId>/...`, `avatars/<userId>.<ext>`.
- Public catalog/system: selected preview/cover/track/audio roots.
- User-owned upload roots: `uploads/<userId>/...`, `previews/<userId>/...`.
- Dedicated-route/private: verification and contract signatures.
- `uploads/` is currently ambiguous: it contains public release assets and private AI references. New private AI uploads need an explicit private root; legacy objects need a documented compatibility policy.

Minimal safe boundary:

1. One pure canonical parser/classifier in `src/lib/storage-object-access.ts`.
2. Explicit allowlists for public read, owner read/write and dedicated-route-only roots.
3. Authorization before body buffering, existence probes, fallback lookup, stream or presign.
4. Re-authorize any fallback-resolved key.
5. Reject malformed and double-encoded separators/dot segments, controls, empty segments and case variants.
6. Bind relay/presign intent to purpose, owner, size and accepted media contract.

## Migration parity and disposable database

Local PostgreSQL 16 binaries (`initdb`, `pg_ctl`, `psql`) are installed. A unique cluster under `/tmp` on a unique port is feasible without touching the configured database.

The repository migration chain cannot provision the current Prisma schema from empty:

- Prisma targets the `icecream` schema and lowercase tables.
- The oldest migrations create legacy public/CamelCase tables.
- A later schema introspection replaced the Prisma datamodel with `icecream.user`, `icecream.release`, and related lowercase models without adding a canonical baseline.
- No migration creates the foundational `icecream.user` or `icecream.release` tables expected by later foreign keys.
- `playlist_placements` exists in `prisma/schema.prisma`, but no migration contains it. It was added schema-first.
- Eleven committed migration files are already locally modified, so existing checksums are not trustworthy for direct deployment.

Required two-lane proof:

1. **Fresh lane:** canonical baseline plus forward migrations applies to an empty disposable database, Prisma generates, schema diff is empty, app boots and social tests pass.
2. **Upgrade lane:** a structure-only disposable clone of the current canonical schema and migration ledger rehearses forward migrations. Never run this rehearsal on the shared database.

`db push` is not an acceptable substitute. A guarded social test seed must require an explicit loopback disposable URL/database name and refuse the ambient `DATABASE_URL`.

## A/B/C browser environment

There is no tracked Playwright config or script. `@playwright/test` appears only as an optional transitive peer and is not installed. Existing `.tmp-*.mjs` scripts are ad-hoc, credential-bearing and unsafe because they use the ambient application/database.

Recommended tracked layout:

- `playwright.config.ts`
- `tests/e2e/auth.setup.ts`
- `tests/e2e/fixtures/community.ts`
- `tests/e2e/community-phase0.spec.ts`
- `scripts/e2e/run-community-e2e.mjs`
- guarded deterministic `scripts/e2e/seed-community-test.ts`

The launcher must create a temporary PostgreSQL cluster, explicit disposable URLs, a run-specific local storage root and a separate Next port. It must use three independent browser contexts/storage states. The entire cluster/storage directory is the cleanup unit.

## Public navigation (COMM-012)

Public destinations already exist, but feed callbacks override them:

- `/artists/[slug]` is a public profile.
- `/feed/[id]` is a public permalink.
- `PublicFeedPage` builds dashboard profile destinations and uses auth/dashboard callbacks for showcase read actions.
- `AuthorHeader` already falls back to the correct public profile link when no override callback is supplied.
- `/feed/[id]` currently redirects authenticated users back to dashboard, violating one stable permalink contract.

Minimal repair: make author and card-open read actions unconditional public links; reserve auth prompts for mutations; keep authenticated users on the same permalink detail page.

## Minimal safety graph (COMM-003)

No report/block models or backend policy exist. The central read/mutation seams are reusable, so a Community rewrite is unnecessary.

Minimal coherent schema:

- `social_user_blocks`: unique blocker/blocked pair, self-block check, bidirectional indexes.
- `social_reports`: reporter, derived reported owner, validated target kind/id, reason/details/status, idempotent reporter+target uniqueness.

Policy when B blocks A:

- For authenticated A and B, visibility and new interactions are symmetric: feed/detail/profile omit or 404 the peer; follow/reaction/comment/reply/DM/collaboration contact reject with 403.
- Anonymous public reading is unchanged; a personal block is not global depublication.
- Blocking removes existing follow edges in both directions; unblock does not restore them.
- Existing message history may remain readable, but no new conversation/message/contact may be created.
- Reports persist for moderation triage but do not automatically remove content.

Required enforcement seams:

- dashboard/public feed aggregation and direct detail lookup;
- public/dashboard profile and social snapshot;
- follow, post/release reaction, comment/reply services;
- direct messages and collaboration contact;
- report target resolution on the server, never trusting reported owner from the client.

Hide/mute is not equivalent to block. Phase 0 should add an explicit per-viewer hidden-content/account preference only if its backend semantics can be enforced consistently; it must not be represented as React-only state.

## Main risks

1. Blanket-public `uploads/` preserves legacy playback but can expose private AI files.
2. Rewriting historical migration files would worsen checksum drift; baseline/forward strategy must preserve an upgrade path.
3. Personalized block enforcement must not be swallowed by existing profile fallback code that converts exceptions to empty 200 responses.
4. Direct messages and collaboration contact are easy policy bypasses if only feed routes are covered.
5. Playwright installation/browser provisioning is a new dev dependency and must be verified in the current environment.

## Stop condition for Phase 0

Phase 0 is complete only when storage negative tests, clean migration parity, guarded disposable A/B/C fixtures, tracked browser tests, public navigation, report/block backend enforcement and the existing social suite all pass. Code presence alone is insufficient.
