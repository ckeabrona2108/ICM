# Social/community functional audit report

Date: 2026-08-11

## Scope and safety

The audit covered the social/community system named in the request. The social audit patch did not intentionally include the musical release creation/edit wizard, delivery, moderation, or release metadata flows. The pre-existing/current dirty worktree already contains unrelated modifications under release submit/wizard/edit paths; those changes were preserved and were not used as social-audit evidence. Existing release records were treated as read-only social attachments. The connected application database appeared to contain non-fixture data, so no destructive or writable A/B/C browser scenario was performed against it.

## Outcome

The active `/feed` and dashboard Community surfaces now use the same canonical feed contract and UI. The highest-impact defects in post/media contracts, comment trees and pagination, follow reads, DM isolation, notification counters, profile types, qualified plays, storage cleanup, authorization, and initial feed performance were repaired with regression coverage.

The expanded social-specific automated suite passes 156/156. TypeScript, targeted ESLint, Prisma validation, and `git diff --check` pass. Guest/read-only browser smoke proves canonical feed rendering and the guest Following auth prompt; it is render-only evidence for visible filters, media cards, reactions, and comments, not functional mutation proof.

The system is not labeled fully PASS because safe multi-user write/refresh verification was blocked by the environment. Remaining architectural limits are listed below.

## Fixed bugs

| Problem | Root cause | Fix | Verification |
|---|---|---|---|
| `/feed` and dashboard Community exposed different capabilities/data | Active routes mounted different legacy/canonical contracts | Both routes load `getPublicFeedPayload` and render `PublicFeedPage`; `/community` remains a canonical redirect | Browser DOM smoke and route inspection |
| Feed initial load was extremely large and slow | Broad catalog/profile hydration, embedded data URIs, and per-item storage probes | Bounded payload/cursor helpers, deterministic cover/audio resolution, avatar sanitization, and smaller release window | 18.87 MB / 22.687 s → 305 KB / 2.314 s |
| Multi/mixed media disappeared across surfaces | Legacy DTO/render path collapsed media to one attachment | Structured media is preserved in order and rendered consistently, with explicit media limits | Post/media regression tests |
| Deleted comments inflated totals or reappeared | Raw relation counts included soft-deleted rows; tree pruning semantics were inconsistent | Counts filter `deleted_at`; deleted leaves are pruned and required ancestors retained | Comment tree/count tests |
| Comment pagination hydrated hundreds of rows before slicing | Root selection occurred in JavaScript after a large query | Root page is selected in Prisma, then replies are loaded only for selected roots | Post and release pagination tests |
| Replies could target deleted parents | Parent lookup did not reject soft-deleted records | Mutation now rejects deleted parents | Regression test |
| Personal profile subscriptions disappeared after refresh | `__personal__` profile keys were not resolved in followed-profile reads | Personal profiles are included in subscription resolution | Regression test |
| Hidden/disabled profile posts remained mutable | Mutation guards checked row existence but not backing public-profile availability | Reaction/comment paths enforce profile availability | Authorization regression test |
| Users could receive self-reaction notifications | Notification producer did not compare actor and recipient | Post and release self-reaction notifications are suppressed | Two regression tests |
| DM delete-for-me could leak/resurface conversations | SQL participant visibility predicate lacked grouping parentheses | Correct participant-scoped predicate | DM service test |
| DM polling hydrated histories for the whole inbox | Conversation service loaded up to 80 messages for every conversation | Only the active conversation hydrates history | DM hydration test |
| New unread messages in the active conversation were not marked read | Client effect key depended only on conversation id | Read key changes when new unread state arrives | Client-state test |
| Delete-for-everyone marked unrelated notifications | Notification update matched only conversation href | Exact message notification hash is targeted | DM notification test |
| Notification badge was capped by the 20-row list | `unreadCount` was derived from the displayed slice | Separate database count supplies the badge | Notification regression tests |
| Optimistic mark-read did not restore on request failure | No rollback snapshot existed | Idempotent rollback helper restores unread state | Notification client-state tests |
| Producer degraded to Artist on some surfaces | Validator, DB check, and display labels disagreed | Producer added to validation/migration and shared labels | Type/migration tests |
| Volume changes restarted audio; missing media could hang | Audio lifecycle effect depended on volume and lacked a terminal error state | Volume is updated independently; failures render unavailable | Lint/typecheck plus player helper tests |
| A play counted immediately and could race | Client posted on play start; server used a non-serialized read/write path | Duration-qualified client trigger, seek exclusion, session-bound identity, transaction advisory lock | Qualified-play and scene-play tests |
| Deleted/discarded social media remained in storage | Upload was immediate and no authenticated delete lifecycle existed | Owner-key validation, reference checks, discard cleanup, and post/comment deletion cleanup | Media ownership/lifecycle tests |
| Social migrations referenced legacy TEXT/quoted tables | Migration history drifted from canonical UUID/lowercase schema | Four migrations repaired with idempotent, non-destructive compatibility logic | Migration tests and Prisma validate |

## Remaining blockers and limits

- A safe isolated application DB with seeded User A/B/C accounts, auth, and writable S3 was unavailable. All write/refresh/cross-user browser scenarios remain `IMPLEMENTED — RUNTIME VERIFICATION BLOCKED`.
- Global heterogeneous feed pagination is bounded and substantially faster, but still aggregates candidate groups before the final cursor slice. It is not yet a single DB-native cursor over every content type.
- Historical profile/post totals still use bounded snapshots in some read models; these need dedicated aggregate queries for exact all-time counters.
- Reaction/follow simultaneous first-click races need a real concurrent database test and, if reproduced, DB serialization/upsert hardening comparable to play recording.
- Message and notification delivery is bounded polling, not SSE/WebSocket. The expensive full-history polling defect is fixed, but true push delivery is not implemented.
- Storage cleanup covers explicit discard/delete. Browser crash, a lost successful upload response, or abandoned sessions still require a scheduled orphan sweeper.
- The inspected migration target had three unapplied migrations. They were not applied because the database was not an isolated fixture and historical checksum drift must be handled during controlled deployment.
- A full read-only database orphan inventory was not completed before the database tunnel became unavailable; database consistency remains PARTIAL.
- No before/after pixel diff was available for dashboard Community. No CSS/theme/layout tokens were intentionally changed, but switching that route to the canonical feed component can affect appearance and therefore needs visual regression approval.

## Automated test results

- Targeted social/community suite: **156 passed, 0 failed**.
- Reproduction command:

```bash
node --import tsx --test src/lib/__tests__/{artist-profile-search,artist-profile-service,artist-profile-shared,artist-profile-type,artist-social-service,browser-audio-clip,community-engine,dashboard-community-performance,dashboard-notification-service,dashboard-topbar-notifications,direct-message-client-state,direct-message-service,feed-auth-prompt,feed-client-state,feed-query-state,feed-scope,global-search-service,http-byte-range,media-signature,qualified-play,scene-discovery,scene-play-service,scene-policy,scene-reaction-service,scene-service,scene-showcase-state,social-migrations,social-post-media,storage-object-access}.test.ts
```

- Repository-wide observed snapshot during the audit: **473 passed, 85 failed**. Its failures were predominantly in existing admin/release/storage/environment/contract/subscription areas; the reproducible social selection above is the authoritative scoped result.
- `npm run -s typecheck`: pass.
- Targeted social ESLint: pass, no warnings.
- `npx prisma validate`: pass.
- `git diff --check`: pass.

## Runtime test results

- Guest `/feed`: canonical page rendered to a complete DOM with global search, scopes, filters, collaboration filters, discovery panels, post cards, players, reactions, and comments. This proves renderability only.
- Guest `Following`: correctly opened the existing authentication dialog with callback to `/feed`.
- `/feed`, `/community`, and dashboard Community were traced to the canonical contract/surface.
- Writable A/B/C posts, reactions, comments, follows, DMs, notifications, refresh, and adversarial authorization requests: **BLOCKED BY ENVIRONMENT**.
- A transient NextAuth client fetch error occurred while the development server/database tunnel was being stopped; `/api/auth/session` returned 200 before the tunnel ended. This is not reported as a clean authenticated runtime pass.

## Performance before / after

Observed on the local development route using the same connected read-only dataset:

| State | Response size | Initial request |
|---|---:|---:|
| Legacy active dashboard path | about 18.87 MB | about 22.687 s |
| Canonical path before storage-probe removal | about 1.99 MB | about 31.8 s |
| Final canonical `/feed` | 305,277 bytes | 2.314 s |

The large improvement came from canonical payload selection, bounded page data, sanitizing embedded avatar payloads, limiting release hydration, and removing feed-time S3 HEAD probes. This does not prove production latency or database query counts under load.

## Schema migrations

- Repaired canonical table/id compatibility in `20260718113000`, `20260718150000`, `20260718190000`, and `20260718210000` social migrations.
- Added/retained compatibility for producer profile type.
- Migration SQL regression tests pass and Prisma schema validates.
- No `prisma migrate reset`, destructive cleanup, or production-data mutation was performed.
- Deployment remains blocked pending a disposable clean-database migration rehearsal and a controlled checksum strategy for environments that already recorded the historical files.

## Manual QA needed

Run the following only in an isolated seeded environment with three users and disposable media storage:

1. A creates text, single/multiple image, video, audio, mixed-media, and existing-release posts; verify immediate state and hard refresh in feed, Community, and profile.
2. B toggles/switches/rapid-clicks reactions while C reacts concurrently; verify one active reaction and exact counters after refresh and forced request failure.
3. B comments, A replies, both delete owned comments, and forbidden deletes are attempted directly through the API.
4. A follows/unfollows artist, group, label, and producer profiles; verify counts, subscriptions, notifications, and Following feed before/after refresh.
5. Exercise cursor pages 1–3 with controlled timestamps and verify no gaps/duplicates for every filter combination.
6. Exercise A/B messaging, unread/read, delete-for-me, delete-for-everyone, C isolation, notification deep links, and update delivery without manual refresh.
7. Play real ranged audio, seek, pause/resume, cross the qualification threshold, replay, and confirm dedupe/ranking propagation.
8. Cancel uploads, fail post creation, delete posts/comments, and run the orphan-object inventory against disposable storage.
