# Isolated Community test database

Community mutation and browser tests must never use the database from `.env` or
`.env.local`. The tracked launcher creates a workspace-owned PostgreSQL cluster
under the operating-system temporary directory and binds it only to loopback.

## Safety contract

- `prisma/seed-social-test.ts` accepts only `SOCIAL_TEST_DATABASE_URL`.
- The host must be loopback.
- The database name must begin with `icm_social_test_`.
- The URL must explicitly select `schema=icecream`.
- The launcher overrides `DATABASE_URL` and `DIRECT_URL` only for its child
  process; it does not edit any environment file.
- The generated database name contains an explicit `e2e` segment and the child
  environment receives the disposable-database/storage flags plus A/B/C login
  credentials expected by the tracked browser fixtures.
- Stop and destroy operations require a workspace-specific ownership marker and
  validate every removable path before cleanup.
- No command uses `prisma db push`.

## Requirements

PostgreSQL server/client tools must be on `PATH`. On macOS, the launcher also
checks `/opt/homebrew/bin`. The tested local version is PostgreSQL 16.

## Commands

Start the disposable server:

```sh
node scripts/test-db/social-test-db.mjs start
```

Run a command with only the disposable connection injected:

```sh
node scripts/test-db/social-test-db.mjs run -- npx prisma migrate deploy
node scripts/test-db/social-test-db.mjs run -- npx prisma migrate status
node scripts/test-db/social-test-db.mjs run -- npx prisma generate
node scripts/test-db/social-test-db.mjs run -- node --import tsx prisma/seed-social-test.ts
```

Run the migration → status → generate → fixture gate with guaranteed cleanup:

```sh
node scripts/test-db/verify-social-test-db.mjs
```

The gate also runs `prisma migrate diff --exit-code` against the live disposable
schema and checks migration health, canonical lowercase core relations, and all
required social tables.

Rehearse the existing-database structure upgrade without reading or writing any
shared database:

```sh
node scripts/test-db/verify-existing-structure-upgrade.mjs
```

This second command creates the current canonical structure from the Prisma
datamodel inside an owned disposable database, records the migration set that
the audit observed as already applied, baselines the legacy-to-canonical bridge
with `migrate resolve`, and then applies pending migrations. Executing the bridge
against an already-canonical database is unsafe because its canonical enum/table
DDL already exists. The rehearsal is a structure-only approximation: it detects
duplicate DDL and migration-history incompatibility, but it cannot prove data
transformations or the exact drift of the inaccessible source database.
The historical cutoff (`20260727120000_add_artist_profile_post_release_link`) is
the audit observation encoded by this proof tool, not a claim about production;
operators must confirm the real `_prisma_migrations` history before using the same
baseline decision anywhere outside the disposable clone.

Inspect, stop, or remove the owned runtime:

```sh
node scripts/test-db/social-test-db.mjs status
node scripts/test-db/social-test-db.mjs stop
node scripts/test-db/social-test-db.mjs destroy
```

## Deterministic identities

| Role | Email | Password | Purpose |
| --- | --- | --- | --- |
| User A | `social-a@example.test` | `SocialTest123!` | author |
| User B | `social-b@example.test` | `SocialTest123!` | second user |
| User C | `social-c@example.test` | `SocialTest123!` | clean observer |

The seed deletes and recreates only these guarded test identities, relying on
database cascades to reset their social state. It creates two local-media release
profiles and one deterministic baseline post. User C starts without follows,
comments, reactions, or notifications.

## Migration-parity status

The launcher deliberately exposes rather than masks repository migration drift.
On 2026-08-19, all 45 migrations deployed successfully into a clean PostgreSQL
16 database, the live-schema diff reported no differences, the structural
assertion found all required canonical social tables with no failed migrations,
and deterministic A/B/C fixtures seeded successfully. The structure-only
existing-canonical rehearsal also passed after baselining the bridge and applying
the eight pending migrations.

The parity migration creates two analytics unique indexes. A real deployment
must preflight those key sets for duplicates; the migration intentionally fails
on conflicting production rows rather than deleting or merging user data.

Run the standalone safety-policy tests with:

```sh
node --test scripts/test-db/social-test-db-policy.test.mjs
```
