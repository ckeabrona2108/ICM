# Feed Social Network Execution Plan

## Existing working systems

- `NextAuth` credentials auth already works through `src/lib/auth.ts` and `/api/auth/[...nextauth]`.
- Public feed stack already exists: `/feed`, `/feed/[id]`, `/api/feed`, `/api/feed/[id]`, pagination, search, filters, scope `all/following`.
- Social storage already exists in Prisma for posts, post comments, post reactions, release reactions, release comments, release plays, followers.
- Artist-owned public profiles already exist in `src/lib/artist-profile-service.ts` with avatar, bio, city, links, catalog release binding and public slugs.
- Follow/unfollow already persists through `artist_profile_followers` and `src/lib/artist-social-service.ts`.
- Notification delivery already persists via `ai_user_notifications` and `src/lib/notification-delivery-service.ts`, including feed-like events such as follows, likes and comments.
- Public release playback and preview URLs already exist in release/profile/feed services.
- Blocked-word moderation is already wired into post/comment validation in `src/lib/artist-social-service.ts`.

## Existing partial systems

- Feed composer exists, but only for owned artist profiles; normal authenticated user has no personal social identity in `/feed`.
- Displayed author types in feed contracts/components are limited to `artist/group/label/platform`; there is no first-class `user` or `producer` rendering path.
- User profile exists via `user` table and `/api/user/profile`, but it is not integrated as a posting identity in feed flows.
- `artistProfileType` exists on `user`, but current normalization only supports `artist/group/label`.
- Dashboard messages page exists, but current implementation is mock/support-preview UI, not a proven real artist-to-artist messaging flow.
- Sidebar recommendation blocks exist, but they are still secondary and not yet tightly connected to collaboration intent discovery.
- Feed comments/reactions UX exists, but detail and list pages still need end-to-end browser verification after recent refactors.

## Missing social loops

- Personal user posting loop is incomplete: an authenticated listener without owned artist profile cannot publish to `/feed`.
- Collaboration intent loop is incomplete: feed posts do not yet expose a structured intent/status model for "looking for producer/artist/label" discovery.
- Social identity loop is incomplete for `producer` and `user` display types.
- Messaging loop must not be surfaced from feed until real messaging is confirmed beyond the mock dashboard page.
- Browser-verified loop coverage is still missing for: create personal/artist post, react, comment, reply, follow, notification redirect, reload persistence.

## Data model changes

- Extend current feed-facing author/profile typing to support personal social identity without replacing existing artist profile storage.
- Prefer reusing `user` as personal identity and existing `artist_profile_posts` table with a safe reserved personal profile key rather than introducing a parallel posting table.
- If needed, extend profile type normalization to safely include `producer` and `user` display values while keeping legacy `artist/group/label` behavior intact.
- Keep notification storage in existing `ai_user_notifications`; no parallel notification table.

## API changes

- Expand feed composer/server validation to accept a personal identity option owned by the authenticated user.
- Keep ownership verification on the server for every selected author identity.
- Expose richer feed composer profiles to the client: display name, type, slug/permalink, avatar where relevant.
- Only expose messaging/report/admin actions in feed if real backend support exists.

## Visible UI changes

- Add a personal posting identity for authenticated users in composer.
- Surface author type consistently in cards and composer selector.
- Add collaboration-oriented metadata only when backed by stored fields, not decorative placeholders.
- Keep share public, auth-gates consistent, and sidebar visually secondary to timeline.

## E2E scenarios

- Authenticated artist creates a post linked to a release and sees it after reload.
- Authenticated non-artist user creates a personal post and sees it after reload.
- Guest opens `/feed`, can read and share, but is prompted to sign in for reaction/comment/following.
- Authenticated listener follows an author, reloads, and sees content in `Подписки`.
- Author receives notification after reaction/comment/follow and can navigate back to the feed item.
- Reply in thread creates persisted nested comment and visible updated preview.

## Migration order

1. Extend feed identity contracts and server-side identity resolution.
2. Add or adapt persistence for personal feed identity using existing tables.
3. Update feed composer UI and author rendering.
4. Verify notification and reload persistence flows.
5. Add targeted tests for new identity resolution and posting rules.

## Implementation stages

1. Introduce personal social identity into feed composer and posting backend.
2. Normalize feed author/profile types for user/producer-safe rendering.
3. Add collaboration-intent support only on top of existing post model if storage can be extended safely.
4. Verify notification loop and redirect loop from feed activity.
5. Run targeted type/tests and browser smoke checks on `/feed`.

## Risks

- Current runtime DB may still lag behind local Prisma schema on some environments; schema-compat paths must not silently hide real failures.
- Feed UI refactors are concentrated in `public-feed-page.tsx`, so accidental regressions in auth/share/comment UX are possible without browser verification.
- Messaging is not product-ready enough to advertise from feed until real persistence is confirmed.
- Extending profile types touches both feed contracts and profile normalization; careless changes could break legacy artist profile flows.
