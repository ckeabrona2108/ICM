# Release State Normalization

Important runtime state must not keep growing inside `release.roles`. The field remains a legacy compatibility source, but new durable state should move into dedicated tables with typed rows, indexes, and backfill migrations.

## Target Tables

- `release_deletion_requests`: release id, user id, reason/comment, requested status, admin decision, timestamps. User cabinet hides releases with an active request; admin keeps full visibility and can restore.
- `smart_link_analytics_events`: release id, smart link id, platform, visitor/session metadata, country/device/referrer, occurred at. Aggregations should read from this table instead of appending counters into `release.roles`.
- `release_draft_metadata`: release id, last edited at, draft expiration at, cleanup status. Draft cleanup policy is 180 days from last edit, without showing this policy in user-facing copy until product explicitly asks for it.

## Migration Order

1. Add tables and write-through code while still reading legacy `release.roles`.
2. Backfill existing deletion, smart link, and draft metadata from `release.roles`.
3. Switch reads to the new tables with legacy fallback only for older rows.
4. Remove writes to `release.roles` for these states.
5. After production verification, remove legacy fallback branches.

## Regression Coverage

- Deletion request hides a release from the user's cabinet but keeps it in admin views.
- Admin restore makes the same release visible again without changing release identity.
- Smart link analytics writes one event per tracked interaction and deduplicates only by explicit idempotency keys.
- Draft cleanup uses `lastEditedAt`, not release creation date.
