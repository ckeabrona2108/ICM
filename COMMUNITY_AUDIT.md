# Community / Feed Functional Audit

Audit date: 2026-08-19  
Audited working tree: current local, uncommitted state  
Verdict: **PARTIALLY** — the project has a substantial social engine, but it is not production-ready as a coherent mini-social-network.

## 1. Executive Summary

Community is more than a mock UI. The repository contains persisted user posts, mixed media, release-linked posts, release cards, threaded comments, reactions, follows, profiles, notifications, direct messages, and public post permalinks. The live public Feed rendered real UGC, platform news, releases and discussions from the configured database. A targeted social suite passed 162/162.

It is still not a complete or safe social system for hundreds of simultaneous users.

The main production blocker is a P0 storage authorization defect: an authenticated caller can write an arbitrary sanitized storage key, while a guest can receive a signed download for a known private key. This breaks the ownership assumptions used by Community media.

The next systemic blockers are:

- four unapplied migrations in the configured database, including feed reactions/comment threads and expanded post content;
- no report, block, mute, hide or moderation workflow;
- no post audience/visibility model and weak consent boundaries for personal profiles;
- no comment reactions, no post editing, and no active-feed comment edit/delete UI;
- non-idempotent post/comment creation and race-prone reaction toggles;
- bounded in-memory aggregation that can omit older posts/profiles and make old permalinks return 404;
- notification delivery without an outbox/retry contract;
- no tracked multi-user browser suite and no safe isolated A/B/C runtime environment.

The strongest product advantage is already visible: releases are first-class Feed entities with artwork, preview playback and profile links, rather than generic attachments. The largest unrealized advantage is the absence of playlist achievements, consented artist milestones and a normalized music activity event pipeline.

### Evidence boundary

- **Observed:** live guest UI, route behavior, real public posts/news/releases/comments, public detail page, public artist page, migration status, read-only aggregate DB counts, browser console and targeted tests.
- **Evidence from code:** full UI → API → service → Prisma → notification traces listed below.
- **Not tested:** authenticated write lifecycle across User A/B/C. The configured DB contains 308 real users and no available seed accounts; creating or mutating social content there would be unsafe.
- **Inference:** concurrency and scale findings that follow directly from transaction shape, missing idempotency keys and bounded queries, but were not load-tested against an isolated database.

## 2. Architecture Discovered

### Routes and surfaces

| Surface | Actual route | Result |
|---|---|---|
| Requested public route | /community/feed | **BROKEN** — live 404 |
| Canonical public feed | /feed | **WORKING** for guest read |
| Legacy community entry | /community | Redirects to /feed |
| Dashboard Community | /dashboard/community | Redirects to login for guest; mounts the same PublicFeedPage when authenticated |
| Post/release/news detail | /feed/[id] | **WORKING** for guest for a known permalink |
| Public artist profile | /artists/[slug] | **WORKING** when opened directly |
| Dashboard artist profile | /dashboard/community/artists/[slug] | Authenticated surface |

Evidence: src/app/community/page.tsx:5-7; src/app/feed/page.tsx:26-45; src/app/(dashboard)/dashboard/community/page.tsx:18-37; src/app/feed/[id]/page.tsx:22-30.

### Layer map

    PublicFeedPage / ArtistProfileSocial / FeedDetailPage
      → local React state, optimistic updates, request queues
      → /api/feed, /api/artists/*, /api/user/artist-profile/*
      → public-feed-service / dashboard-community-service / artist-social-service
      → Prisma social tables + object storage
      → notification-delivery-service
      → ai_user_notifications + optional web push
      → dashboard notification API + 45-second/focus polling

Key files:

- UI/state: src/components/feed/public-feed-page.tsx:213-297,512-559,852-1230
- Feed API: src/app/api/feed/route.ts:11-28
- Feed aggregation: src/lib/public-feed-service.ts:297-617
- Social read model: src/lib/dashboard-community-service.ts:348-807
- Social mutations: src/lib/artist-social-service.ts:259-1287
- Notifications: src/lib/notification-delivery-service.ts:58-117; src/lib/dashboard-notification-service.ts:349-415
- Schema: prisma/schema.prisma:606-717,1056-1069

### Stored entities

- artist_profile_posts: user/profile-owned posts, optional release, text and legacy media columns.
- artist_profile_post_likes: one reaction per viewer/post through a unique constraint.
- artist_profile_post_comments: nested, soft-deleted comments.
- scene_release_likes and scene_release_comments: separate engagement graph for release cards.
- artist_profile_followers: unique follower/profile edge.
- ai_user_notifications: persisted notification rows with CTA href.
- news: legacy platform news read model.
- playlist_placements: exists in Prisma schema but the configured DB table is absent.

Read-only DB probe: 308 users, 9 posts, 3 post reactions, 3 post comments, 1 release reaction, 3 release comments, 2 follow edges and 25 notifications. playlist_placements returned Prisma P2021 because the table does not exist.

### Feed source and ordering

The effective top-level kinds are post, release and news. Platform news is merged after social items, not globally sorted with them: four or five social items are chunked before a news insertion. Public pagination reconstructs a bounded feed and searches for a base64 timestamp/id cursor in memory.

Evidence: src/lib/feed-contract.ts:8-44,82-130; src/lib/public-feed-service.ts:328-445,515-617.

Consequences:

- ordering is hybrid editorial insertion, not strict chronology;
- only a bounded candidate set is visible;
- an invalid/stale cursor resets to page one;
- older items and profiles can disappear beyond hard caps;
- detail lookup reuses the bounded core, so an old valid permalink may become a 404.

## 3. Current Feature Inventory

| Capability | Status | Evidence / limit |
|---|---|---|
| Public heterogeneous feed | WORKING | Live UGC images, news and release cards rendered at /feed |
| Text post creation | NOT_TESTABLE | Implemented in code; no safe writable seed DB |
| Image/audio/video post media | PARTIALLY_WORKING | Contract, upload and rendering exist; P0 storage authorization invalidates safety |
| Multiple media | PARTIALLY_WORKING | Up to 8 items, max one audio and one video; stored partly as JSON prefix in text |
| Generic files/attachments | NOT_IMPLEMENTED | No document/file attachment entity |
| Release-linked post | PARTIALLY_WORKING | Implemented and tested in unit suite; write runtime not exercised |
| Release card with preview | PARTIALLY_WORKING | Live cards rendered; playback avoided because it could record a play in real data |
| Platform news | WORKING read-only | Live news rendered; zero reactions/comments and separate legacy data model |
| Post reactions | PARTIALLY_WORKING | Persisted model/UI/notification chain exists; concurrency race and no runtime A/B/C proof |
| Comments | PARTIALLY_WORKING | Live comments render; create chain exists; no safe write runtime |
| Replies/threads | PARTIALLY_WORKING | Recursive model/service; no runtime A/B/C proof |
| Comment reactions | NOT_IMPLEMENTED | No model, contract, API, UI or notification producer |
| Edit post/comment | NOT_IMPLEMENTED | Item routes expose delete, not PATCH/PUT |
| Delete post | PARTIALLY_WORKING | Ownership service exists; media cleanup has shared-key risk |
| Delete comment | PARTIALLY_WORKING | API/service exist; active Feed has no delete control |
| Public permalink/detail | PARTIALLY_WORKING | Known guest permalink works; discovery is confusing and old items can fall outside cap |
| Profiles | PARTIALLY_WORKING | Direct public profile works; guest author click in Feed incorrectly opens an auth prompt |
| Follow graph | PARTIALLY_WORKING | Unique edge and Following scope exist; no block/private-profile semantics |
| Notifications | PARTIALLY_WORKING | Producers and persisted UI exist; delivery can be swallowed and is polling-based |
| Direct messages | PARTIALLY_WORKING | Separate subsystem; not part of Feed conversation graph |
| Mentions/hashtags | NOT_IMPLEMENTED | Plain text only; no parsing/index/navigation/notification contract |
| Search/discovery | PARTIALLY_WORKING | Global search/filter UI exists; feed completeness is bounded |
| Report/block/mute/hide | NOT_IMPLEMENTED | No social model/API/UI/enforcement |
| Per-post privacy/audience | NOT_IMPLEMENTED | Posts are public; no audience column or backend policy |
| Auto release activity | PARTIALLY_WORKING | Approval can create a linked post when autoPublish is enabled; release card also appears independently |
| Playlist achievement event | BROKEN | Schema model exists, configured DB table absent, no Feed ingestion/consent/renderer |
| Save/bookmark | BROKEN | Visible bookmark control has no persistence handler |
| Repost | NOT_IMPLEMENTED | Share exists; no native repost entity |

## 4. End-to-End Test Results

### Live runtime observations

1. /community/feed returned a 404. /dashboard/community redirected the guest to /login. /feed was the actual public route.
2. /feed rendered four recent UGC image posts, platform news, many release cards and visible counters from the configured database.
3. Guest Following opened an auth dialog and preserved a callback URL.
4. A known /feed/post_<uuid> permalink rendered full media, reactions, comments and an author link without login.
5. Direct /artists/<slug> rendered a public profile and, after social data loaded, its four posts and existing comment threads.
6. Clicking the author in the public Feed did not open that public profile; it opened an auth dialog targeting the dashboard profile route.
7. “Открыть в community” on a public post opened an auth dialog for comments rather than opening the public permalink.
8. Browser console contained only Next Image LCP warnings for the first feed images; no runtime JavaScript errors were observed.

### Authenticated A/B/C scenarios

All authenticated mutation scenarios are **NOT_TESTABLE** in this environment:

- documented seed accounts are absent from the connected database;
- a test login was rejected by the live app;
- the database contains non-fixture user data;
- seeding, publishing, reacting, following or deleting would mutate real/shared state.

This limitation applies to post creation, persistence after refresh, cross-user visibility, reaction/unlike, comments/replies, notifications, read state, follow/unfollow and authorization attacks through the live API. Code and tests support parts of these flows, but they are not marked WORKING without runtime proof.

### Automated verification

Command executed:

    node --import tsx --test src/lib/__tests__/{artist-profile-search,artist-profile-service,artist-profile-shared,artist-profile-type,artist-social-service,browser-audio-clip,community-engine,dashboard-community-performance,dashboard-notification-service,dashboard-topbar-notifications,direct-message-client-state,direct-message-service,feed-auth-prompt,feed-client-state,feed-query-state,feed-scope,global-search-service,http-byte-range,media-signature,qualified-play,scene-discovery,scene-play-service,scene-policy,scene-reaction-service,scene-service,scene-showcase-state,social-migrations,social-post-media,storage-object-access}.test.ts

Result: **162 passed, 0 failed**.

Important limit: these are primarily unit/service tests with mocks. There is no tracked Playwright/Cypress multi-user suite and no route-level integration coverage for storage IDOR, cross-user deletion, concurrency, CSRF/origin, moderation or privacy.

### Migration status

Prisma reported 40 migrations, with four unapplied:

- 20260728191000_add_feed_reactions_and_comment_threads
- 20260731123000_add_direct_messages
- 20260810121000_harden_social_direct_messages
- 20260816120000_expand_artist_profile_post_content

No migration was applied during this audit.

## 5. Social Graph / Event Flows

    CREATE_POST
      ├── validate text/media/release ownership
      ├── persist artist_profile_posts
      ├── return server item and prepend locally
      ├── notify unique followers synchronously
      └── GAP: no idempotency key; notification failure has no outbox retry

    REACT_POST / REACT_RELEASE
      ├── authenticate + rate limit
      ├── transaction: read current → delete/update/create
      ├── return exact aggregate → replace optimistic state
      ├── upsert author notification
      └── GAP: race-prone toggle; repeated changes can resend push/reset unread

    COMMENT / REPLY
      ├── validate parent and content
      ├── create comment
      ├── rebuild/render thread
      ├── notify post/release author and distinct parent author
      └── GAP: no idempotency; parent-delete TOCTOU; active Feed lacks delete UI

    REACT_COMMENT
      └── GAP: model → API → aggregate → notification → UI are all absent

    FOLLOW_PROFILE
      ├── unique follow edge
      ├── update follower count
      ├── include owner profiles in Following scope
      └── GAP: no block/private-profile policy; bounded profile source

    RELEASE_APPROVED
      ├── release becomes a distinct Feed kind
      ├── optional auto-generated linked post when autoPublish is enabled
      ├── notify followers
      └── GAP: possible conceptual duplicate; no normalized activity-event identity

    PLAYLIST_PLACEMENT
      ├── Prisma model only
      ├── DB table missing
      └── GAP: no trigger, consent, Feed source, renderer, interaction or notification

## 6. Comparison: Our Product vs Pulse vs Serum

| Capability | ICM Community | T‑Bank Pulse | Serum |
|---|---|---|---|
| Public feed | WORKING read | WORKING publicly observed | NOT_TESTABLE |
| Addressable post detail | PARTIAL; known route works, discovery/caps weak | WORKING; public detail with full thread | NOT_TESTABLE |
| Typed feed content | Post/release/news | UGC, channels, editorial, podcasts/ideas/domain entities | NOT_TESTABLE |
| Images | Implemented; storage unsafe | Observed and documented | NOT_TESTABLE |
| Video | Implemented in contract/upload | Short video documented | NOT_TESTABLE |
| Native audio/music | Strong release previews and audio posts | Live audio rooms/recordings; ordinary audio attachment not confirmed | NOT_TESTABLE |
| Comments/replies | Partial | Public thread observed; reply comments documented | NOT_TESTABLE |
| Comment reactions | Missing | Observed on real comments | NOT_TESTABLE |
| Edit/delete | Delete partial, edit missing | Post/comment edit and delete documented | NOT_TESTABLE |
| Mentions/hashtags | Missing | Navigable and mention notification documented | NOT_TESTABLE |
| Profiles/following | Partial | Public profiles, follower graph and Following feed | NOT_TESTABLE |
| Discovery | Filters/search, bounded | Search, recommendations, hashtags, entity/topic/profile feeds | NOT_TESTABLE |
| Notifications | Producers exist; lifecycle not runtime-proven | Mention notification and push settings documented; other event lifecycle not fully proven publicly | NOT_TESTABLE |
| Privacy/block/report | Missing | Public/hidden profile, blacklist, report and moderation rules documented | NOT_TESTABLE |
| Moderation | Regex blacklist only | Postmoderation, selective prereview, removal/warnings/profile restriction | NOT_TESTABLE |
| Save/share/repost | Share partial; bookmark nonfunctional; no repost | Share/permalink + favorites; native repost intentionally absent | NOT_TESTABLE |

Pulse evidence:

- [Live Pulse feed](https://www.tbank.ru/invest/pulse/) — current UGC, official channels, hashtags, entity links and comments entrypoints.
- [Concrete post inspected](https://www.tbank.ru/invest/social/profile/Winter_Wolves_Trading/2fbb3558-194d-4bd2-8d53-3ad0ed7c946a/) — author profile, permalink, tags/entities, reactions, three visible comments and comment likes.
- [Pulse publishing help](https://www.tbank.ru/invest/help/services/pulse/about/content/) — create, edit/delete, mentions, hashtags, links, images, short video and share.
- [Feed/follow/discovery help](https://www.tbank.ru/invest/help/services/pulse/about/posts/) — Following, profile, hashtag and topic feeds plus recommendations.
- [Profile help](https://www.tbank.ru/invest/help/services/pulse/about/profile/) — public/hidden profile and social interactions.
- [Blacklist/report help](https://www.tbank.ru/invest/help/services/pulse/about/blacklists/) and [moderation rules](https://www.tbank.ru/invest/help/services/pulse/about/rules/).

Serum evidence limit: https://serum.space/feed failed with DNS ERR_NAME_NOT_RESOLVED on 2026-08-19. Focused searches found no official accessible page or reliable primary documentation. No Serum capability is inferred.

## 7. Broken / Incomplete Flows

1. **Media ownership chain:** Community upload keys look owner-scoped, but generic storage routes can overwrite another owner's key and expose a signed download.
2. **Engagement return loop:** post/release likes and comments create notification rows, but delivery failures are swallowed and not retried; full A/B notification navigation was not runtime-testable.
3. **Comment engagement:** users can discuss and reply, but cannot react to comments at all.
4. **Content lifecycle:** users can create/delete posts but cannot edit; active Feed does not expose comment deletion even though the API exists.
5. **Safety lifecycle:** users cannot report abusive content, block an account, mute it, hide a post or appeal moderation.
6. **Privacy lifecycle:** a personal post is public by default and can make profile data public; there is no per-post audience or block filtering.
7. **Pagination/permalink lifecycle:** bounded aggregation can remove older content from feed and detail lookup.
8. **Release activity:** release entities are native and strong, but auto-post and release card are two parallel representations without one canonical activity event.
9. **Playlist achievement:** no executable path from placement → consent → feed event → engagement → notification.

## 8. Bugs

### COMM-001 — P0 — Media storage authorization

- **Area:** Media storage / authorization.
- **Scenario:** User B sends PUT/relay upload using a key under User A's artist-social prefix; a guest requests a known private key.
- **Expected:** backend verifies ownership for writes and denies private reads without an authorized relation.
- **Actual:** generic PUT/relay accept any sanitized key after authentication; GET signs any resolved key without an auth deny gate.
- **Reproduction:** authenticate; PUT bytes to /api/uploads/object/artist-social/<other-user>/x; or POST /api/uploads/relay?key=<other-key>. For read, GET a known private storage key unauthenticated.
- **Evidence:** src/app/api/uploads/object/[...key]/route.ts:100-155,280-303; src/app/api/uploads/relay/route.ts:27-59.
- **Relevant files:** src/app/api/uploads/object/[...key]/route.ts; src/app/api/uploads/relay/route.ts; src/lib/storage-object-access.ts.
- **Likely root cause:** path sanitization is treated as authorization; public-streamability is a fast path, not an access policy.
- **Recommended fix:** central storage authorization policy, owner-prefix binding, explicit public/private roots, deny-by-default GET, route-level IDOR tests, signed-upload constraints.

### COMM-002 — P1 — Social schema not deployed

- **Area:** Database / deployment.
- **Scenario:** runtime uses reactions, threads, DMs and expanded post media/content against the configured DB.
- **Expected:** deployed schema matches the Prisma client and current code.
- **Actual:** four migrations are unapplied; playlist_placements is present in Prisma but absent in DB.
- **Reproduction:** run npx prisma migrate status and a read-only playlist_placements count.
- **Evidence:** migration status output; Prisma P2021 for icecream.playlist_placements.
- **Relevant files:** prisma/schema.prisma; prisma/migrations/20260728191000_add_feed_reactions_and_comment_threads/migration.sql; prisma/migrations/20260731123000_add_direct_messages/migration.sql; prisma/migrations/20260810121000_harden_social_direct_messages/migration.sql; prisma/migrations/20260816120000_expand_artist_profile_post_content/migration.sql.
- **Likely root cause:** feature work advanced ahead of controlled migration deployment/checksum reconciliation.
- **Recommended fix:** rehearse all migrations on a disposable clone, reconcile checksums, deploy in order, then run route-level social smoke tests.

### COMM-003 — P1 — No report/block/mute/hide moderation system

- **Area:** Moderation / safety.
- **Scenario:** User B encounters abusive post/comment or wants to stop interaction with User A.
- **Expected:** report and block actions persist and are enforced by backend reads/mutations.
- **Actual:** no models, routes, services or UI; only a short profanity regex exists.
- **Reproduction:** inspect an own/foreign post and comment menu, then search social routes/schema for report, block, mute, hide and moderation-state contracts; none are present.
- **Evidence:** src/lib/text-moderation.ts:1-18; no social report/block models/routes in schema or app API.
- **Relevant files:** src/lib/text-moderation.ts; src/lib/artist-social-service.ts; prisma/schema.prisma; src/components/feed/public-feed-page.tsx.
- **Likely root cause:** safety was treated as input validation rather than a social graph subsystem.
- **Recommended fix:** minimal report entity + moderation status + block edges + backend query/mutation enforcement before growth features.

### COMM-004 — P1 — No post visibility/audience model

- **Area:** Privacy / consent.
- **Scenario:** a user wants followers-only/private content or wants automatic activity to require consent.
- **Expected:** stored audience/visibility and backend authorization determine every read.
- **Actual:** post schema has no visibility; personal profiles are effectively public once a personal post exists; no block filter exists.
- **Reproduction:** inspect artist_profile_posts fields and the personal-profile resolver; create-path has no audience input and read paths have no audience predicate.
- **Evidence:** prisma/schema.prisma:606-624; src/lib/artist-profile-service.ts:707-735; src/lib/artist-social-service.ts:190-249.
- **Relevant files:** prisma/schema.prisma; src/lib/artist-profile-service.ts; src/lib/artist-social-service.ts; src/lib/public-feed-service.ts.
- **Likely root cause:** public Feed was the only modeled audience.
- **Recommended fix:** define public/followers/private/system-event audiences, explicit consent for automatic events, and enforce in feed/detail/profile services.

### COMM-005 — P1 — Comment reactions are absent

- **Area:** Comment engagement.
- **Scenario:** User A reacts to User B's comment.
- **Expected:** one persisted reaction, correct counter, unlike/change semantics and notification for B.
- **Actual:** no model, route, contract field, UI or notification producer.
- **Reproduction:** open a rendered comment in Feed/detail/profile and inspect available actions; search schema and comment APIs for reaction state or mutation.
- **Evidence:** prisma/schema.prisma:627-702; src/lib/feed-social-helpers.ts:80-124; comment routes expose GET/POST/DELETE only.
- **Relevant files:** prisma/schema.prisma; src/lib/feed-social-helpers.ts; src/app/api/artists/posts/[id]/comments/route.ts; src/app/api/scene/releases/[id]/comments/route.ts; src/components/feed/public-feed-page.tsx.
- **Likely root cause:** reactions were implemented only for top-level posts/releases.
- **Recommended fix:** normalized comment reaction model with unique actor/comment, atomic mutation, aggregate DTO and notification event.

### COMM-006 — P1 — Edit lifecycle is missing

- **Area:** Post/comment lifecycle.
- **Scenario:** author corrects a post or comment.
- **Expected:** owner-only edit, validation, edited timestamp, refreshed feed/detail and stable permalink.
- **Actual:** create/delete exist; no update route or active UI.
- **Reproduction:** open own-item action menus in code and send an allowed-method inspection to item routes; there is no PATCH/PUT handler.
- **Evidence:** src/app/api/user/artist-profile/posts/[id]/route.ts:9-38; social comment routes expose GET/POST/DELETE.
- **Relevant files:** src/app/api/user/artist-profile/posts/[id]/route.ts; src/app/api/artists/posts/[id]/comments/route.ts; src/app/api/scene/releases/[id]/comments/route.ts; src/components/feed/public-feed-page.tsx.
- **Likely root cause:** schema timestamps were added without mutation contracts.
- **Recommended fix:** owner-checked PATCH with optimistic concurrency/versioning and consistent edited indicator.

### COMM-007 — P1 — Reactions and creates are not concurrency/idempotency safe

- **Area:** Concurrency / reliability.
- **Scenario:** rapid like/unlike in two tabs, retry after a lost create/comment response, or simultaneous duplicate submission.
- **Expected:** deterministic one reaction state and exactly-once logical post/comment/notification.
- **Actual:** reaction transaction performs read then delete/update/create; create/comment always insert a new ID; no idempotency key.
- **Reproduction:** in an isolated DB, submit two simultaneous reaction toggles or repeat identical create/comment requests after suppressing the first response; inspect final row/state and duplicate notifications.
- **Evidence:** src/lib/artist-social-service.ts:839-949,1034-1056,1178-1219; unique constraints only prevent duplicate active reactions.
- **Relevant files:** src/lib/artist-social-service.ts; prisma/schema.prisma; src/components/feed/public-feed-page.tsx; src/components/feed/feed-detail-page.tsx.
- **Likely root cause:** component-local queues substitute for server serialization.
- **Recommended fix:** advisory/row locks or atomic upsert semantics, mutation idempotency keys and deterministic notification event identities.

### COMM-008 — P2 — Feed and permalink completeness are bounded

- **Area:** Feed ordering / pagination / detail.
- **Scenario:** older content/profile falls outside 200/240/48 caps or cursor item is no longer in the rebuilt candidate set.
- **Expected:** stable DB-native pagination and resolvable permalink for every non-deleted item.
- **Actual:** aggregation is bounded/in-memory; missing cursor resets to first page; detail lookup uses the same bounded core.
- **Reproduction:** seed more than the source caps, request page cursors and then open an older known item directly; also request a cursor omitted from the rebuilt candidate set.
- **Evidence:** src/lib/public-feed-service.ts:328-353,515-636; src/lib/dashboard-community-service.ts:348-433,545-568,798-807.
- **Relevant files:** src/lib/public-feed-service.ts; src/lib/dashboard-community-service.ts; src/app/api/feed/route.ts; src/app/api/feed/[id]/route.ts.
- **Likely root cause:** heterogeneous feed composed after capped per-source hydration.
- **Recommended fix:** canonical feed-event table or union/keyset query; direct detail lookup by kind/id independent of feed window.

### COMM-009 — P2 — Notification delivery is not durable/idempotent

- **Area:** Notifications / event delivery.
- **Scenario:** notification push/upsert fails or a user changes reaction repeatedly.
- **Expected:** mutation persists an event once, retryable delivery occurs, and an already-read row is not spuriously reset.
- **Actual:** failures are logged/swallowed; no outbox; repeated active reaction can resend push and reset read state.
- **Reproduction:** in an isolated DB, force notification persistence/push failure during a successful social mutation; then switch reaction type or unlike/like and inspect row read-state plus push attempts.
- **Evidence:** src/lib/notification-delivery-service.ts:58-117; src/lib/artist-social-service.ts:872-889,1197-1219.
- **Relevant files:** src/lib/notification-delivery-service.ts; src/lib/artist-social-service.ts; src/lib/dashboard-notification-service.ts; prisma/schema.prisma.
- **Likely root cause:** notification is a synchronous best-effort side effect.
- **Recommended fix:** transactional outbox, event version/state policy, retry/dead-letter handling and delivery idempotency.

### COMM-010 — P2 — Notification text can expose encoded post metadata

- **Area:** Notifications / content encoding.
- **Scenario:** user reacts/comments on a structured media/collaboration post.
- **Expected:** notification preview uses decoded human text/title.
- **Actual:** producer slices raw stored post.content, which can begin with structured JSON metadata.
- **Reproduction:** create a collaboration or multi-media post, react/comment from another account, and inspect the notification message.
- **Evidence:** src/lib/collaboration.ts:123-193; src/lib/artist-social-service.ts:879,1205-1215.
- **Relevant files:** src/lib/collaboration.ts; src/lib/artist-social-service.ts; src/lib/notification-delivery-service.ts.
- **Likely root cause:** notification producer bypasses the shared post decoder.
- **Recommended fix:** generate previews from the canonical decoded DTO.

### COMM-011 — P2 — Media cleanup can break another post

- **Area:** Media lifecycle / deletion.
- **Scenario:** two posts reference the same owner-scoped media key; one post is deleted.
- **Expected:** object survives while any post references it.
- **Actual:** attach validation permits owned-key reuse; delete removes collected storage keys without a global reference check.
- **Reproduction:** in disposable storage, create two posts referencing the same owned key, delete one, then reload the surviving post.
- **Evidence:** src/lib/artist-social-service.ts:65-69,165-168,272-300,331-347; src/app/api/user/artist-profile/posts/[id]/route.ts:23-27.
- **Relevant files:** src/lib/artist-social-service.ts; src/app/api/user/artist-profile/posts/[id]/route.ts; src/lib/social-post-media.ts.
- **Likely root cause:** object lifecycle is tied to one post instead of reference ownership.
- **Recommended fix:** normalized media asset/ref table or reference-count/query-before-delete policy.

### COMM-012 — P2 — Public Feed navigation sends guests to auth-only surfaces

- **Area:** Public navigation / profiles / permalinks.
- **Scenario:** guest clicks an author or “Открыть в community” from the public Feed.
- **Expected:** open /artists/[slug] or /feed/[id], both of which are publicly readable.
- **Actual:** author opens a login dialog targeting dashboard profile; “Открыть in community” opens an auth prompt for comments.
- **Evidence:** live browser; src/components/feed/public-feed-page.tsx:2513-2521,2752-2764. Direct public detail and profile were verified separately.
- **Reproduction:** as guest at /feed, click the author and then “Открыть в community”; compare with direct /artists/[slug] and /feed/post_[id].
- **Relevant files:** src/components/feed/public-feed-page.tsx; src/app/feed/[id]/page.tsx; src/app/artists/[slug]/page.tsx.
- **Likely root cause:** showcase-mode actions reuse authenticated dashboard callbacks despite public routes existing.
- **Recommended fix:** use public permalink/profile links for read actions and reserve auth prompts for mutations.

### COMM-013 — P2 — Comment counts can become partial or include deleted rows

- **Area:** Comments / aggregates.
- **Scenario:** feed contains more comments than the global capped comment query or soft-deleted comments.
- **Expected:** exact visible aggregate from dedicated count queries.
- **Actual:** bounded loaded arrays are used as totals in aggregation; one read path does not filter deleted rows before length.
- **Reproduction:** seed more comments than the global hydration cap plus soft-deleted comments, load Feed and compare card count with direct DB visible count/detail thread.
- **Evidence:** src/lib/dashboard-community-service.ts:650-704,734-788.
- **Relevant files:** src/lib/dashboard-community-service.ts; src/lib/feed-social-helpers.ts; prisma/schema.prisma.
- **Likely root cause:** hydration arrays double as aggregate counters.
- **Recommended fix:** separate database counts filtered by deleted_at and page comments independently.

### COMM-014 — P3 — Profile stats flash false zero values

- **Area:** Profile loading state.
- **Scenario:** open a public profile before its client social request completes.
- **Expected:** loading/unknown state.
- **Actual:** posts/followers/likes initially display zero, then jump after load.
- **Reproduction:** open a public profile on a cold page and observe counters before and after /api/artists/[slug]/social completes.
- **Evidence:** live profile observation; src/components/landing/artist-profile-social.tsx:431-449.
- **Relevant files:** src/components/landing/artist-profile-social.tsx; src/app/api/artists/[slug]/social/route.ts.
- **Likely root cause:** null snapshot is rendered as zero.
- **Recommended fix:** skeleton/unknown state until snapshot resolves; distinguish unavailable from true zero.

## 9. Missing Capabilities

### Must have

- Close COMM-001 storage IDOR/overwrite and deploy schema safely.
- Report post/comment/user, block and hide/mute with backend enforcement.
- Post/comment edit plus accessible own-comment delete.
- Comment reactions and complete notification loop.
- Stable direct permalinks and DB-native pagination.
- Idempotent mutations and durable notification outbox.
- Explicit visibility/consent policy for user and automatic activity.
- Tracked isolated A/B/C E2E environment and authorization tests.

### Strong opportunity

- Mentions, hashtags and topic/entity feeds.
- Normalized music activity events with release/playlist/milestone types.
- Following vs discovery ranking with explainable source labels.
- Functional save/bookmark and share analytics.
- Moderation queue, reasons and user-visible status.

### Optional

- Live audio rooms, reposts, paid/private channels, creator analytics.
- Rich link previews and external-source cards.

### Irrelevant competitor features

- Brokerage, portfolio, ticker prices, trading strategy and investment performance mechanics from Pulse.

## 10. Pulse Findings

The audit opened the live Pulse feed and a real post by Winter_Wolves_Trading. The post had a stable public permalink, author link, hashtags, entity links, a strategy card, seven likes, three visible comments, individual comment likes and related author posts. The feed also exposed official channels, private channels, live broadcasts, search and recommended official profiles.

Official Pulse help corroborates create/edit/delete, images and short video, replies, mentions, hashtag/topic discovery, Following, public/hidden profiles, blacklist/report, moderation and shareable links. Only mention notifications were explicitly confirmed; the complete like/comment/follow notification lifecycle was not claimed without an authenticated test.

## 11. Serum Findings

Serum was **NOT_TESTABLE**. https://serum.space/feed did not resolve in the browser on 2026-08-19. Focused searches returned no accessible official page or reliable primary documentation. This materially lowers confidence in any comparison, so no Serum feature was invented or inferred.

## 12. Music-Specific Opportunities

1. Make track/release entities the canonical attachment, with stable rights-aware preview, queue, seek state and a single global player.
2. Create a normalized SocialActivityEvent for release published, track premiered, playlist placement, milestone and editorial feature.
3. Require explicit per-event consent/visibility for automatically generated artist activity.
4. Let reactions/comments target the music entity while preserving the surrounding post conversation.
5. Add artist/user follows that directly shape a Following feed without requiring profile caps.
6. Add playlist placement cards only after the missing DB model is deployed and the event has provenance, consent and dedupe.
7. Separate editorial music news from ordinary UGC while allowing intentionally configured interactions.
8. Preserve player continuity across Feed/detail/profile and define competition between post audio and the global release player.

## 13. Recommended Priority Roadmap

### Phase 0 — Broken fundamentals

- Fix COMM-001.
- Rehearse and deploy pending migrations; prove schema parity.
- Add minimal report/block/hide and backend enforcement.
- Add isolated seeded A/B/C environment and route-level authorization tests.
- Fix public navigation to existing public detail/profile routes.

### Phase 1 — Complete social loop

- Comment reactions, post/comment edit/delete UI, idempotent mutations.
- Transactional notification outbox with correct deep links and read-state semantics.
- DB-native cursor and direct detail lookup.
- Visibility/audience and consent rules.

### Phase 2 — Music-native social layer

- Canonical track/release attachment and player contract.
- Normalized release/playlist/milestone activity events.
- Consent, dedupe, artwork/player renderer and engagement for those events.

### Phase 3 — Discovery and growth

- Mentions, hashtags, topic/entity feeds and explainable recommendations.
- Functional saves, creator analytics and optional live/community formats.

## 14. Final Verdict

### Can Community already be considered a complete mini-social-network?

**PARTIALLY.** It has real persisted social primitives and a credible music-first feed, but the safety, privacy, moderation, concurrency, delivery and deployment guarantees required for production are incomplete. The P0 media authorization defect alone prevents a YES verdict.

| Area | Score | Evidence-based explanation |
|---|---:|---|
| Feed | 6/10 | Heterogeneous live feed, filters and public detail; bounded aggregation, confusing public navigation and hybrid/capped ordering |
| Publishing | 5/10 | Text/mixed media/release/collaboration paths exist; no edit/idempotency and no safe runtime A/B/C proof |
| Media | 3/10 | Rich image/audio/video contract and player UI, but P0 storage authorization and lifecycle gaps |
| Social interactions | 4/10 | Post/release reactions and follows exist; races, no comment reactions, no block/report |
| Comments | 4/10 | Threads/replies and soft delete service exist; no reactions/edit and active Feed lacks own-delete UI |
| Notifications | 5/10 | Relevant producers, deep-link fields and unread UI exist; best-effort delivery, no outbox and no live A/B verification |
| Profiles/follow graph | 5/10 | Public profiles and Following scope exist; guest navigation mismatch, no privacy/block semantics and bounded source |
| Reliability | 2/10 | P0 IDOR, four unapplied migrations, missing DB table, no multi-user E2E and bounded aggregates |
| Music-native functionality | 6/10 | Release cards, linked releases and preview player are strong; playlist/milestone event pipeline is absent |
| Overall Community readiness | **4/10** | Useful beta foundation, not safe or complete enough for hundreds of real concurrent users |

## Ranked Synthesis and Confidence

| Rank | Conclusion | Confidence | Basis |
|---:|---|---|---|
| 1 | Community is a genuine but incomplete social engine | High | Live data, schema, routes, services and 162 passing targeted tests |
| 2 | It is not production-ready | High | P0 storage flaw, missing safety/privacy, schema drift and no multi-user runtime proof |
| 3 | Music-native differentiation is viable | High | First-class release cards/player already work in public read UI |
| 4 | Scale failures will appear before product-capability limits are reached | Medium-high | bounded aggregation, synchronous fan-out and non-idempotent mutation shapes; no load test |
