# Plan: social gaps

Date: 2026-08-10

Scope:

- Fix destructive DM deletion semantics.
- Harden DM read validation and improve DM UX copy/role labels/live refresh.
- Add producer support to global search.
- Harden artist social media upload validation with magic-byte sniffing.
- Add targeted tests for the changed behavior.

Phases:

1. Add additive DM storage fields for per-user hide semantics.
2. Update DM service queries and mutations to use visibility rules instead of destructive deletes.
3. Update DM contracts and UI for role labels, safer delete UX, and periodic refresh.
4. Add upload signature helper and wire it into artist social upload API.
5. Extend tests and run focused verification.

Acceptance checks:

- Deleting a dialog no longer removes the second participant's history.
- Deleting a message no longer removes it for the second participant.
- Invalid conversation ids on mark-read return `400`.
- `producer` is visible in search-facing contracts and tests.
- Uploads with spoofed MIME but wrong bytes are rejected.
