# Community production hardening specification

## Goal

Turn the existing Community primitives into a safe, testable mini-social-network without rewriting the feed, player, release or profile systems.

## Current delivery boundary

Implementation proceeds through Phase 0 first. Phase 1 and Phase 2 may begin only after every Phase 0 gate is proven in a disposable environment.

## Phase 0 acceptance criteria

### Storage

- Every generic storage read/write is classified by a shared deny-by-default backend policy.
- A caller cannot write another user's namespace through object PUT, relay or presign intent.
- Private/dedicated-route objects are not probed, streamed or presigned for an unauthorized caller.
- Relay enforces owner, namespace, maximum bytes, MIME/extension/signature compatibility and auth before storage write.
- Malformed, encoded and double-encoded traversal/normalization inputs are rejected before any storage dependency is called.

### Database and fixtures

- A tracked command creates a disposable PostgreSQL database/cluster and refuses shared/ambient URLs.
- A fresh empty database reaches the canonical Prisma schema using migrations only.
- `playlist_placements` has migration history.
- Prisma generate/validate and schema-diff parity pass.
- Deterministic A/B/C fixtures and minimal public profiles/releases are seeded only into a guarded disposable database.

### Browser foundation

- A tracked Playwright suite runs three real independent sessions.
- The suite never reuses a running app or ambient database.
- Failure artifacts are retained; database and storage are disposable per run.

### Navigation

- Author read navigation goes to `/artists/<slug>` for guest and authenticated viewers.
- Item read navigation goes to `/feed/<id>` without an auth prompt.
- Like/comment/follow/publish/report/block continue to require authentication.

### Safety

- Report post, release, post comment, release comment and user resolve target ownership server-side and persist idempotently.
- Block/unblock has one explicit symmetric authenticated-user policy.
- Block enforcement covers feed, detail, profiles, visible comments/replies, follow, reactions, comments/replies, direct messages and collaboration contact.
- Blocking removes existing mutual follow edges; unblocking does not restore them.
- UI success causes a server refetch; UI hiding is not the security boundary.

## Compatibility constraints

- Preserve existing Community DTOs and service boundaries where possible.
- Preserve public catalog/release media playback.
- Preserve existing uncommitted user changes and do not rewrite locally modified migration history in place.
- Do not mutate the configured/shared database or real storage.
- Do not use `prisma db push` for schema parity.
- Do not expose credentials in tracked tests or reports.

## Phase 1 contract after the gate

- Comment reactions, edit/delete lifecycle, idempotent creates/reactions, durable notification outbox, exact destinations, decoded previews, direct permalinks, stable keyset pagination, exact counters, audience enforcement and safe media references.
- Passing browser chain across A/B/C, including lost-response and multi-tab concurrency cases.

## Phase 2 contract after Phase 1

- Canonical social activity events for release/playlist/milestone/editorial activity.
- Stored, reversible and auditable consent/visibility.
- Release representation dedupe and playlist-placement provenance/dedupe.
- Native music entity attachment and one player-continuity contract.

## Non-goals

- A broad Community rewrite.
- Phase 3 growth features such as hashtags, recommendations or live rooms.
- Production migration deployment to the shared database in this task.
- Replacing object storage infrastructure solely for tests.

## Verification contract

After each bounded change: targeted tests. At each phase gate: Prisma validate/generate, typecheck, relevant full social suite and browser A/B/C suite. Checklist items become checked only after fresh evidence.
