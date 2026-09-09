# Community Audit Regression Checklist

Audit baseline: 2026-08-19.  
Legend: checked means verified by live read behavior or a fresh automated test. Unchecked means broken, absent or not safely testable. Each unchecked line includes the audit status.

## Environment and routes

- [ ] Requested /community/feed resolves to Community — BROKEN: live 404
- [x] /community redirects to /feed
- [x] /feed renders the public Community feed
- [x] /dashboard/community requires authentication
- [x] Known /feed/post_<id> permalink renders for a guest
- [x] Direct /artists/<slug> profile renders for a guest
- [x] Guest author click in /feed opens the public profile
- [x] “Открыть в community” opens the public permalink

## Architecture and deployment

- [x] Social Prisma schema validates through the targeted test suite
- [ ] All repository migrations are deployed — BROKEN: four unapplied
- [ ] playlist_placements table exists in configured DB — BROKEN: Prisma P2021
- [x] Tracked isolated test DB/storage environment exists
- [x] Tracked Playwright/Cypress A/B/C suite exists

## Feed sources

- [x] User posts render in public feed
- [x] Platform news renders as a distinct type
- [x] Release cards render as a distinct type
- [x] Release cards expose artwork and preview entrypoint
- [x] Platform news links to a detail page
- [ ] Platform news supports configured reactions/comments — NOT_IMPLEMENTED
- [ ] Playlist achievements enter Feed — NOT_IMPLEMENTED
- [ ] Milestone/activity events enter Feed through a normalized event entity — NOT_IMPLEMENTED
- [ ] Automatic activity requires stored consent/audience — NOT_IMPLEMENTED

## Feed ordering and pagination

- [x] Initial feed uses deterministic ordering inside each source
- [x] Platform news insertion follows the implemented hybrid chunk rule
- [x] Cursor/append client rejects stale responses
- [ ] Feed is globally chronological — PARTIALLY_WORKING: editorial insertion breaks chronology
- [ ] Cursor is DB-native and stable after new inserts — PARTIALLY_WORKING: bounded rebuild
- [ ] Invalid/stale cursor fails explicitly — BROKEN: silently resets to page one
- [ ] Older posts remain discoverable beyond hard caps — BROKEN by bounded candidates
- [ ] Every valid non-deleted permalink resolves independent of feed cap — BROKEN by bounded detail lookup
- [ ] Comment/reaction counts remain exact beyond hydration caps — PARTIALLY_WORKING

## Post creation

- [ ] User A can publish a text post — NOT_TESTABLE in safe runtime
- [x] Empty post validation exists in service schema
- [x] Text is capped at 1500 characters in service schema
- [ ] User A sees post immediately and after refresh — NOT_TESTABLE
- [ ] User B sees User A post — NOT_TESTABLE
- [ ] User C sees the same shared state — NOT_TESTABLE
- [ ] Retry after lost response does not duplicate post — BROKEN: no idempotency key
- [ ] User can edit own post — NOT_IMPLEMENTED
- [x] Owner-only post delete check exists in service
- [ ] Cross-user post delete returns 403 in route-level integration test — NOT_TESTABLE / no tracked test
- [ ] Repeated concurrent delete is idempotent — PARTIALLY_WORKING

## Images and generic media

- [x] Image magic-byte validation exists
- [x] Image size cap is 8 MB
- [x] Multiple ordered media items are represented in the feed contract
- [x] Composer can remove a pending media item in UI
- [ ] Oversized upload is rejected before buffering whole body — BROKEN
- [ ] Image decode/dimension limits are enforced — NOT_IMPLEMENTED
- [ ] Failed upload retry is covered by browser test — NOT_TESTABLE
- [ ] Broken media renders a verified fallback — PARTIALLY_WORKING
- [ ] Generic file/document attachment exists — NOT_IMPLEMENTED

## Storage security

- [x] Generic PUT binds key to authenticated user
- [x] Relay upload binds key to authenticated user
- [x] Relay enforces size/type/signature policy
- [x] Private storage GET requires authorization
- [x] Route-level IDOR tests cover write and read
- [x] Social media helper validates owner prefix
- [x] Owner-prefix validation cannot be bypassed through generic storage route
- [ ] Deleting one post preserves media referenced by another post — BROKEN
- [ ] Orphaned upload sweeper exists — NOT_IMPLEMENTED

## Audio and music

- [x] Audio attachment type exists
- [x] Audio magic-byte validation exists
- [x] Audio size cap is 25 MB
- [x] Feed audio player implements play/pause/seek/duration/error states in code
- [x] Qualified play logic ignores seeks and deduplicates in targeted tests
- [ ] Live playback was verified without mutating real counters — NOT_TESTABLE
- [ ] Starting another feed audio has verified interaction with global player — NOT_TESTABLE
- [x] Release is a first-class Feed entity
- [x] Post can link a release
- [x] Release approval can create an auto-publish post when opted in
- [ ] Auto-post and release-card representations have canonical dedupe identity — PARTIALLY_WORKING

## Video

- [x] Video attachment type exists
- [x] Video magic-byte validation exists
- [x] Video size cap is 80 MB
- [x] Contract limits a post to one video
- [ ] Live upload/preview/playback/persistence for User A/B was verified — NOT_TESTABLE
- [ ] Video duration/transcode/codec validation exists — NOT_IMPLEMENTED

## Post reactions

- [x] One reaction per viewer/post unique constraint exists
- [x] Toggle/change service returns exact aggregate
- [x] Self-reaction notification suppression has a passing test
- [ ] User B reaction persists after reload — NOT_TESTABLE
- [ ] User A sees updated count — NOT_TESTABLE
- [ ] User C sees shared count without liked-state leakage — NOT_TESTABLE
- [ ] Rapid multi-tab reaction toggle is serialized — BROKEN
- [ ] Duplicate request is idempotent — PARTIALLY_WORKING
- [ ] Unlike notification semantics are explicitly defined — PARTIALLY_WORKING

## Comments and replies

- [x] Root comments and nested replies exist in schema/service
- [x] Empty and oversized comment validation has passing tests
- [x] Reply to deleted parent is rejected in targeted test
- [x] Soft-deleted ancestor can preserve live descendants in tree
- [ ] User B comment persists after refresh — NOT_TESTABLE
- [ ] User A sees User B comment — NOT_TESTABLE
- [ ] Comment avatar/profile link is verified for A/B — NOT_TESTABLE
- [ ] Comment creation retry is idempotent — BROKEN
- [ ] Parent deletion and simultaneous reply are serialized — PARTIALLY_WORKING
- [ ] Active Feed exposes delete for own comment — BROKEN
- [ ] User can edit own comment — NOT_IMPLEMENTED
- [ ] Post owner/admin can moderate an abusive foreign comment — NOT_IMPLEMENTED
- [ ] Comment totals exclude deleted rows in every aggregate path — PARTIALLY_WORKING

## Comment reactions

- [ ] Comment reaction model exists — NOT_IMPLEMENTED
- [ ] User A can react to User B comment — NOT_IMPLEMENTED
- [ ] Comment reaction count persists — NOT_IMPLEMENTED
- [ ] Comment unlike/change works — NOT_IMPLEMENTED
- [ ] Comment author receives notification — NOT_IMPLEMENTED
- [ ] Duplicate comment reaction is prevented — NOT_IMPLEMENTED

## Profiles and follows

- [x] Public profile shows avatar, display name, handle and profile type
- [x] Public profile exposes release and post tabs
- [x] Public profile loads existing posts/comments
- [ ] Profile counters show loading instead of false zero — BROKEN P3
- [x] Unique follow edge exists
- [x] Self-follow is rejected in service
- [x] Following scope requires authentication for guests
- [x] Personal-profile follows survive read resolution in targeted test
- [ ] User B follow changes User A followers count after reload — NOT_TESTABLE
- [ ] Following feed changes after follow/unfollow in live A/B runtime — NOT_TESTABLE
- [ ] Private profile follow request semantics exist — NOT_IMPLEMENTED
- [x] Blocked-user filtering exists
- [ ] Deleted/suspended account behavior is covered by E2E — NOT_TESTABLE

## Notifications

- [x] Post reaction producer exists
- [x] Post comment producer exists
- [x] Reply-to-parent-author producer exists
- [x] Follow producer exists
- [x] Follower post/release producer exists
- [x] Notification list and unread count persist in DB model
- [x] Individual mark-read rollback has passing tests
- [x] Topbar polls and refreshes on focus
- [ ] User A receives User B reaction notification in live runtime — NOT_TESTABLE
- [ ] User A receives User B comment notification in live runtime — NOT_TESTABLE
- [ ] User B receives User C reply notification in live runtime — NOT_TESTABLE
- [ ] User B receives comment-reaction notification — NOT_IMPLEMENTED
- [ ] Notification deep link opens exact post/comment in live runtime — NOT_TESTABLE
- [ ] Notification delivery has transactional outbox/retry — NOT_IMPLEMENTED
- [ ] Reaction changes do not resend push/reset read state — PARTIALLY_WORKING
- [ ] Notification preview always decodes structured post content — BROKEN
- [ ] Deleting source post retracts or tombstones stale notification — PARTIALLY_WORKING
- [ ] Multiple similar notifications have defined grouping behavior — NOT_IMPLEMENTED

## News and editorial content

- [x] Platform news is visibly distinct from UGC
- [x] News detail link works from feed contract
- [ ] News uses the richer news_posts migration model — BROKEN: legacy news service/schema split
- [ ] News interaction policy is configurable — NOT_IMPLEMENTED
- [ ] News has a normal author/profile graph — PARTIALLY_WORKING: platform identity only

## Release and playlist activity

- [x] Approved releases become visible release cards
- [x] Release card has artwork, artist, link and preview entrypoint
- [x] Release reactions/comments have separate persisted models
- [x] Auto-publish release post requires profile autoPublish setting
- [ ] Release event stores an explicit per-event consent record — NOT_IMPLEMENTED
- [ ] Duplicate release card + auto-post is prevented by canonical event ID — PARTIALLY_WORKING
- [ ] playlist_placements table exists in current DB — BROKEN
- [ ] Placement event trigger exists — NOT_IMPLEMENTED
- [ ] Placement consent/opt-out exists — NOT_IMPLEMENTED
- [ ] Placement Feed renderer exists — NOT_IMPLEMENTED
- [ ] Placement interactions/notification exist — NOT_IMPLEMENTED

## Privacy, consent and authorization

- [x] Social mutation routes require session
- [x] Post delete service checks owner
- [x] Notification mark-read checks user ownership
- [x] Disabled/admin-hidden managed profiles are protected in targeted tests
- [ ] Post has public/followers/private audience — NOT_IMPLEMENTED
- [ ] Personal profile can remain private after posting — NOT_IMPLEMENTED
- [ ] Automatic activity has explicit consent and deletion policy — NOT_IMPLEMENTED
- [x] Block list is enforced in feed/detail/profile/mutations
- [ ] Cross-user post/comment delete has route-level integration coverage — NOT_IMPLEMENTED
- [ ] CSRF/origin policy has social route tests — NOT_IMPLEMENTED

## Moderation and safety

- [x] Basic profanity validation exists
- [ ] Profanity bypass/evasion tests exist — NOT_IMPLEMENTED
- [x] Report post exists
- [x] Report comment exists
- [x] Report user exists
- [x] Block user exists
- [x] Mute/hide content exists
- [ ] Moderation status/reason/queue exists — NOT_IMPLEMENTED
- [ ] Removed content has defined thread/notification behavior — NOT_IMPLEMENTED

## Loading, empty and error states

- [x] Feed client distinguishes loading, empty and refreshing in targeted test
- [x] Guest auth prompt sanitizes callback URL in targeted test
- [x] Feed request state rejects stale responses in targeted test
- [x] Public feed rendered without JavaScript errors in live browser
- [ ] Profile social stats have a truthful loading state — BROKEN P3
- [ ] Failed post mutation has browser-tested optimistic rollback — NOT_TESTABLE
- [ ] Failed like/comment has browser-tested rollback — NOT_TESTABLE
- [ ] Expired auth during mutation is covered by E2E — NOT_TESTABLE
- [ ] Slow network and aborted upload are covered by E2E — NOT_TESTABLE

## Concurrency and reliability

- [ ] Double post submit is idempotent — BROKEN
- [ ] Double comment submit is idempotent — BROKEN
- [ ] Rapid like/unlike is server-serialized — BROKEN
- [ ] Multi-tab reaction state converges without 500 — NOT_TESTABLE
- [ ] Multiple app instances share rate limits — BROKEN: process-local limiter
- [ ] Notification side effects are exactly once — BROKEN
- [ ] Feed counters use dedicated exact aggregate queries — PARTIALLY_WORKING
- [ ] Load test covers hundreds of concurrent social users — NOT_IMPLEMENTED

## Competitor evidence

- [x] Live Pulse feed inspected
- [x] Real Pulse permalink/thread inspected
- [x] Pulse official help checked for publishing/edit/delete/mentions
- [x] Pulse official help checked for follow/discovery/privacy/block/report/moderation
- [ ] Pulse full like/comment/follow notification lifecycle tested with an account — NOT_TESTABLE
- [ ] Serum live feed inspected — NOT_TESTABLE: DNS ERR_NAME_NOT_RESOLVED on 2026-08-19
- [ ] Serum capabilities inferred from non-primary sources — intentionally not done

## Release gate

- [x] No P0 issues remain
- [x] All social migrations are applied and verified on a disposable clone
- [ ] Seeded A/B/C E2E passes post → reaction/comment → notification → exact destination
- [x] Media ownership/private-read route tests pass
- [ ] Report/block/privacy backend enforcement passes
- [ ] Multi-tab concurrency/idempotency suite passes
- [ ] Feed pagination/permalink tests pass beyond current caps
- [ ] Final audit verdict reaches YES with no required NOT_TESTABLE core flows
