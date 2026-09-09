# Research: social gaps

Date: 2026-08-10

Problem areas confirmed in code:

- Direct message deletion is destructive for both participants because conversation delete removes the shared row and cascades messages.
- Message deletion physically deletes the shared message instead of hiding it only for the sender.
- Direct message read route accepts arbitrary `id` and relies on a later SQL cast.
- Messages UI exposes technical storage text and lacks recipient role labeling.
- Global search excludes `producer` even though the domain model supports it.
- Artist social media upload validates only client MIME and does not inspect file signatures.
- Direct messages page has no live refresh path beyond initial load.

Best-fit implementation strategy:

1. Convert direct-message deletion semantics to per-user hiding with minimal additive schema changes.
2. Keep pairwise conversation uniqueness and revive hidden conversations when a new message arrives.
3. Add sender-only message hiding instead of shared row deletion.
4. Add server-side file signature sniffing for allowed image/audio/video formats and reject mismatches.
5. Extend contracts/UI to carry participant profile type and remove technical copy.
6. Add lightweight polling/focus refresh as an immediate improvement for message freshness.

Why this is the best option:

- It fixes the data-loss bug without redesigning the whole DM system.
- It stays compatible with the current API shape and UI flow.
- It closes the highest-risk abuse vector in uploads with a bounded helper instead of a large storage rewrite.
- It is testable with targeted service/unit tests inside the existing repo setup.
