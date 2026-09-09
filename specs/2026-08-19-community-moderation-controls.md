# Community moderation controls

## Goal

Authenticated Community viewers can report posts, comments, or users; block authors; hide individual publications; and mute authors.

## Acceptance criteria

- Reports use the existing idempotent report API.
- Blocks use the existing symmetric block API and immediately remove the author's content locally.
- Hide persists per viewer and removes only the selected post or release.
- Mute persists per viewer and removes the author's feed content without preventing direct profile access or interactions.
- Authenticated feed/detail reads apply hide/mute preferences; guest reads remain unchanged.
- Own content cannot expose report, block, or mute actions.
- Focused service/UI contract tests, typecheck, and lint pass.

## Non-goals

- Admin moderation queues, appeals, automatic moderation, or UI for managing preference history.
