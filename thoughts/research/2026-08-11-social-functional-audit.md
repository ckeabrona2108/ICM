# Social/community functional audit — Phase 0

Date: 2026-08-11

Scope: all social/community functionality. Musical release creation and editing remain explicitly out of scope. UI is visually frozen.

## Architecture conclusion

The active `/feed`, `/community` redirect target, and `/dashboard/community` all render `ArtistCommunityDashboard` and fetch `/api/dashboard/community`. The richer `PublicFeedPage` + `/api/feed` stack contains cursor/search/reaction/community-engine capabilities but has no active renderer. This split is the primary contract/synchronization defect.

## Ranked defects

### P0

1. The checked-in social migration chain references legacy `icecream."User"`/`"Release"` TEXT identifiers while the current Prisma schema and later migrations require lowercase UUID tables. A clean migration path is not reproducible.
2. Active feed/community bypasses the canonical feed contract: advanced search, cursor pagination, typed reactions, replies, multi-media, canonical ranking, and release play tracking are absent or inconsistent.
3. Active feed collapses multi/mixed media to one item; the composer creates only one attachment.
4. Soft-deleted comments remain visible as tombstones and continue to affect counters; list/detail UIs apply incompatible local deletion semantics.
5. Comment/reply pagination loads up to 500 rows and slices roots in JavaScript, producing false totals and possible orphaned reply topology.

### P1

1. Feed pagination/filter/search happen after bounded full hydration; posts older than 40 can disappear from feed/detail/search.
2. Personal/producer follows persist as `__personal__` but disappear from subscriptions and Following feed after refresh.
3. Producer is offered by UI/API but excluded by an existing DB CHECK and managed-profile validation/render branches.
4. DM delete-for-me is broken for `participant_a` because an SQL `OR` group lacks parentheses.
5. Newly polled messages in an already-open conversation remain unread.
6. DM/notification update delivery performs full polling reloads; message polling can hydrate up to 4,000 messages per cycle.
7. Delete-for-everyone marks unrelated unread DM notifications for the same conversation read.
8. Notification unread count is capped to the latest 20 rows.
9. Social upload objects are not lifecycle-cleaned on replace/cancel/failure/post deletion; post creation does not verify object existence/type.
10. Active release cards do not pass `releaseId` to the audio player, so plays are not recorded.
11. A play is counted on the initial `play` event with no duration threshold; anonymous visitor IDs make author self-plays look external to ranking.
12. Feed audio player reinitializes and resets on volume changes.
13. Hidden/disabled-profile posts remain directly reactable/commentable by guessed UUID.
14. Dashboard and Community Engine use different ranking sources/formulas.

### P2

1. Reaction/follow read-then-write toggles are race-prone under concurrent first clicks.
2. Post/release self-reactions can notify the owner.
3. Individual notification optimistic read has no rollback.
4. Push delivery has server/SW pieces but no client registration/subscription flow.
5. Public-profile post/comment/like counters are capped by 30-item snapshots.
6. Feed payload can embed very large data-URI avatars; a two-item API request produced an approximately 250 KB response before truncation in audit output.

## Runtime evidence and limits

- Local health endpoint returned `database: ok`.
- Guest `/api/feed?limit=2` returned `200`; `/feed` returned `200` in about 0.9s in the sampled request.
- Browser `/feed` remained in `Загружаем сообщество...` with an empty alert during the sampled guest run.
- Three seeded test accounts are defined in `prisma/seed.ts`, but the currently running application database rejected those credentials. The connected application database appears to contain non-seed data, so mutation testing was stopped to avoid touching real records.
- `prisma migrate status` reports three unapplied migrations: feed reactions/comment threads, direct messages, and hardened social direct messages.
- Existing targeted social tests: 76 passed, 0 failed. These are primarily schema/helper/mock tests and do not prove the failing DB/browser scenarios.

## Recommended implementation order

1. Make schema/migrations safely reproducible and establish an isolated seeded test runtime.
2. Repair active feed/community contract and high-risk authorization/counter semantics.
3. Add real DB pagination and deterministic reaction/comment/follow behavior.
4. Repair DM isolation/unread/notification correctness.
5. Repair media lifecycle and qualified-play semantics.
6. Run multi-user browser QA, refresh checks, performance measurements, and full gates.
