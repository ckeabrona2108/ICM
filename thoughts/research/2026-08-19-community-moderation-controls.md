# Community moderation controls research

The Community feed already exposes authenticated report and symmetric block APIs, and backend reads enforce blocks. The visible post overflow menu only offers share/copy; comments have reply only. There is no per-viewer hide or mute persistence.

Recommendation: keep report/block on the existing safety boundary and add one narrow `social_feed_preferences` table for `hide` (post/release UUID) and `mute` (user UUID). Filter preferences only for authenticated feed reads. Use one reusable client menu for post/release/comment/user actions and optimistically remove hidden, muted, or blocked content after the API confirms success.

This is smaller and clearer than overloading blocks (which have mutual interaction semantics) or browser-only storage (which would not follow the account across devices).
