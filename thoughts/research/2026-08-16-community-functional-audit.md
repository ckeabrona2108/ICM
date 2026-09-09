# Community functional audit research

## Scope

Audit `/feed`, `/feed/[id]`, `/dashboard/community`, artist profiles, social media uploads, reactions, comments/replies, follows, notifications, play counts, direct messages, deletion, sharing and feed filters. Preserve the current visual design and release creation/edit flow.

## Confirmed findings

1. The dashboard composer exposes every owned profile and trusts the selected `artistKey`; the product contract requires the authenticated account identity only.
2. Collaboration publication types are disabled for the personal account because composer availability is incorrectly coupled to the profile's public `collaboration.open` setting.
3. Structured post metadata is prepended to user content but stored in `varchar(1500)`, so otherwise valid media/collaboration posts can fail at the database boundary.
4. Composer uploads can exceed the aggregate eight-item limit before state truncation, creating unused storage objects. Optimistic posts also revoke their blob previews before the canonical reload completes.
5. Reactions are exclusive in the database, but the client permits overlapping mutations; stale responses can overwrite newer choices. No regression test covers heart -> fire -> diamond -> off.
6. Comment/reply persistence exists, but “show all comments” toggles the current section instead of loading the complete comment tree from the existing GET routes.
7. Reply notifications exist, but their links point to public feed detail. New ordinary posts do not notify followers. Release notifications omit followers of the personal profile.
8. Following scope is implemented, but the current owner-expansion semantics can show sibling profiles as unfollowed. Follow controls also need a mutation guard on the profile page.
9. Dashboard author navigation leaves the dashboard shell. Public release cards and `/feed/[id]` expose social controls, violating the read-only showcase boundary.
10. Feed pagination is performed after an upstream 20-item truncation; items beyond the first page are unreachable. Specific permalink lookup scans the capped timeline, so older canonical links can return 404.
11. The “Новости” type accepts only platform news after composition and drops user text/news posts. The UI omits the existing `posts` type and hides existing collaboration intent/role filters.
12. Direct messages are persisted with membership checks and notifications, but sending a new message clears both participants' hidden markers, restoring old history for a recipient who deleted the conversation.
13. Community audio uses qualified playback tracking; other artist-profile players increment earlier, so counts are inconsistent across surfaces. Server POST does not independently prove listening duration.

## Existing evidence

- Targeted baseline: 77 relevant unit tests passed.
- Typecheck passed before changes.
- No dev server was running at the start of this audit.
- Local database configuration points to PostgreSQL on `localhost:5433`; no destructive production operation is required.

## Recommendation

Repair the proven contract violations with small boundary changes: force personal composer identity server-side, decouple collaboration post category from availability settings, harden content/media limits, serialize client mutations, load comments explicitly, complete follower notifications, establish dashboard-scoped profile navigation, make public surfaces read-only, and give pagination/deep-link lookup one reliable data source. Add regression tests before each behavior change where the current suite lacks coverage.
