# Community functional recovery specification

## Goal

Make `/dashboard/community` a reliable authenticated mini-social network while `/feed` remains a read-only showcase.

## Acceptance criteria

- Composer publishes only as the authenticated personal account; no author selector or forgeable alternate `artistKey`.
- Standard, collaboration, media-only and release-linked posts validate and publish without HTTP 500.
- Image, video and audio attachments respect type, size, ownership and aggregate-count limits.
- Exactly one reaction per viewer/item; switching to any supported reaction, including diamond, is deterministic.
- Comments and nested replies persist, render, load fully and notify the intended recipient.
- Qualified release plays update consistently from supported feed/profile players.
- Follow/unfollow has deterministic busy/rollback behavior; following scope contains content from followed profiles only.
- Followers receive notifications for new posts and releases, including personal-profile follows.
- Artist cards opened from dashboard remain inside the dashboard shell; unauthenticated public visitors cannot bypass profile gating.
- Direct messages persist with membership privacy; hiding a conversation is not undone incorrectly.
- Delete removes only the owner's post and referenced media; share/copy produces a canonical link that opens that exact item.
- Filters for releases, video, news, media, ordinary posts and collaboration categories return the intended content.
- `/feed` and public feed detail do not mutate social state; playback remains available.
- Pagination exposes content after the first page and old valid permalinks do not depend on the current first page.

## Constraints

- Preserve existing UI composition except controls required to satisfy the functional contract.
- Do not change release creation/edit flow.
- Do not perform destructive operations against non-local databases or production storage.
- Preserve existing API response compatibility where possible.

## Non-goals

- New recommendation algorithms.
- New real-time transport for messages or notifications.
- A new media transcoding pipeline.
- A full database redesign beyond the smallest schema correction required to prevent proven post failures.
