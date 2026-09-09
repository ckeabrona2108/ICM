# Community functional recovery plan

## Phase 1 — composer and persistence

- Add regression coverage for personal author identity, collaboration categories and encoded content length.
- Force personal identity in UI and API.
- Decouple post category from public collaboration availability.
- change structured post content storage to text safely and harden aggregate media limits/optimistic URLs.

## Phase 2 — interactions and notifications

- Add reaction-switch and mutation-order coverage; serialize reaction/follow requests.
- Replace comment open/close misuse with explicit full-tree loading.
- Route social notifications back to dashboard item anchors.
- Notify personal-profile followers about posts and releases.
- Align profile audio players with qualified-play tracking where the existing callback allows it.

## Phase 3 — feed, routing and messages

- Keep dashboard artist profiles under a dashboard-scoped route.
- Remove mutation controls from public release/detail surfaces and gate direct profile access.
- Correct news/posts/collaboration filter UI and service semantics.
- Remove upstream pagination truncation and implement direct canonical item lookup.
- Preserve per-user hidden conversation semantics on send.

## Phase 4 — verification

- Run targeted social tests, full typecheck and lint.
- Start the local application and verify guest `/feed`, authenticated dashboard composer, filters, profiles, follow, reactions, replies, share/deep-link, messages, playback and delete with local-only test data.
- Run a fresh code review; report PASS/PARTIAL/BLOCKED per subsystem and list unrelated suite failures separately.

## Challenge log

- Alternative: rewrite the social subsystem. Rejected because it would risk the existing visual/player/release flows.
- Alternative: UI-only guards. Rejected for author identity and public-profile access because direct API/URL access would bypass them.
- Alternative: leave `varchar(1500)` and silently shorten user text. Rejected because it loses user content; a text column matches the existing 1500-character application limit while allowing structured metadata.
- Every planned change maps directly to an acceptance criterion; unrelated cleanup is excluded.
