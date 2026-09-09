# Community production hardening plan

## Phase 0A — lock storage behavior with tests

1. Add pure policy regression cases for namespace classification, cross-user access and normalization attacks.
2. Extract thin testable route handlers/dependency seams without changing successful response contracts.
3. Apply authorization before body/probe/sign/stream work in object PUT/GET.
4. Bind presign/relay to authenticated owner and explicit upload purpose; enforce byte and media policy.
5. Move new AI references to an explicit private owner root while documenting legacy `uploads` behavior.
6. Run storage policy, route, media-signature, S3 and typecheck gates.

## Phase 0B/C — migration baseline and disposable fixtures

1. Add a guarded disposable PostgreSQL launcher using a temporary PG16 cluster and unique port.
2. Generate a canonical baseline migration for fresh databases; keep legacy history archived/documented rather than editing checksummed SQL further.
3. Add forward migration(s) for playlist placement and Phase 0 safety models.
4. Add deterministic, idempotent, guarded A/B/C social fixture seed.
5. Prove: empty DB -> migrations -> generate -> diff parity -> seed -> targeted social tests.
6. Add a separate documented upgrade-rehearsal path for a structure-only clone; do not claim shared DB deployment.

## Phase 0D — tracked browser harness

1. Add `@playwright/test`, config, scripts and ignore rules.
2. Launch Next with explicit disposable DB/storage/auth environment and no existing-server reuse.
3. Create A/B/C authenticated storage states and independent contexts.
4. Add Phase 0 browser tests for public navigation, storage authorization and safety flows.

## Phase 0E — public read navigation

1. Replace showcase/dashboard callbacks for author and item read actions with public links.
2. Keep auth prompts only on mutations.
3. Remove authenticated permalink redirect so `/feed/<id>` is stable for every authorized viewer.
4. Add pure/browser regressions.

## Phase 0F — minimal report/block backend enforcement

1. Add schema/migration models and a shared `social-safety-policy` service.
2. Add report and block APIs with auth, validation, rate limits and stable errors.
3. Enforce block policy in feed/detail/profile reads and every existing interaction service, including messages/contact.
4. Add minimal post/comment/profile actions; refetch server truth after block.
5. Add unit, route and A/B/C direct-API bypass tests.

## Phase 0 gate

- Run all new negative storage/authorization tests.
- Run clean migration and schema parity proof on disposable PostgreSQL.
- Run targeted social suite, typecheck, lint if operational, Prisma validate/generate.
- Run tracked Phase 0 Playwright suite.
- Update only verified checklist lines and create the Phase 0 section of `COMMUNITY_IMPLEMENTATION_REPORT.md`.

## Phase 1 — only after Phase 0 passes

Implement in independent TDD slices: comment reactions; post/comment edit and own-comment delete UI; request idempotency and reaction serialization; transactional outbox; exact notification anchors/tombstones; decoded previews; direct detail lookup and keyset pagination; exact aggregates; audience policy; reference-safe media cleanup. Run the required twelve A/B/C scenarios before advancing.

## Phase 2 — only after Phase 1 passes

Add canonical social activity events, consent/audience/provenance/dedupe, release representation policy, playlist-placement pipeline/card/engagement and unified player ownership. Verify release and placement chains in A/B/C.

## Challenge log

- **Coverage:** block enforcement includes DMs and collaboration contact, not only the visible feed. Storage policy covers fallback-resolved keys and presign intent, not only PUT.
- **Alternative considered:** patch one missing playlist migration. Rejected because foundational canonical tables are absent from fresh history; it would not satisfy the clean-database gate.
- **Alternative considered:** rewrite all historical migrations. Rejected because eleven are already locally modified and production ledgers may contain their previous checksums. A new baseline plus explicit upgrade rehearsal is safer.
- **Alternative considered:** React-only block/hide. Rejected because direct API and other surfaces bypass it.
- **Alternative considered:** blanket-public `uploads/`. Rejected for new data because AI references share the root; introduce explicit private purpose while preserving legacy compatibility intentionally.
- **Efficiency:** reuse existing feed aggregation, profile snapshot, mutation services, auth/rate-limit helpers and local filesystem test storage. No new framework beyond the requested browser runner.
- **No code for code's sake:** Phase 3 features, admin moderation console and ranking work remain out of scope unless required by a proven blocker.

## Stop/escalation conditions

- Do not touch the shared database/storage.
- If Playwright or browser binaries cannot be installed, keep the code/test harness tracked, report the exact provisioning blocker and do not mark browser items verified.
- If a safe baseline cannot reconcile clean and upgrade lanes, stop before schema deployment and report the migration conflict with reproducible evidence.
