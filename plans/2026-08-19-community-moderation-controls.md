# Community moderation controls plan

1. Add the minimal preference schema/migration and a tested service contract.
2. Add authenticated preference API and feed filtering.
3. Add a reusable Community safety menu and wire post/release/comment actions.
4. Run focused tests, full typecheck, targeted lint, and self-audit guest/owner behavior.

Alternatives rejected: using blocks for mute changes interaction semantics; localStorage is not account-scoped across devices; separate hide/mute tables add unnecessary schema and service duplication.
