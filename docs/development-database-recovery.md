# Development Database Recovery

## Current runtime configuration

- The development Next.js server reads `DATABASE_URL` and `DIRECT_URL` from `.env.local`.
- `.env.local` overrides the base `.env` values and points runtime to local PostgreSQL on `127.0.0.1:5433`.
- `NEXTAUTH_URL` is set for local browser testing on `http://localhost:3002`.
- `.env.example` documents a standard PostgreSQL or Supabase setup with runtime `DATABASE_URL` and migration `DIRECT_URL`; it does not document a special local `5433` service.

## What the project expects

- `package.json` uses Prisma as the source of truth:
  - `npm run prisma:migrate` -> `prisma migrate dev`
  - `npm run prisma:migrate:deploy` -> `prisma migrate deploy`
  - `npm run prisma:seed` -> `tsx prisma/seed.ts`
- `prisma/schema.prisma` configures PostgreSQL with `schemas = ["icecream"]`.
- The current Prisma models for feed and social features expect tables inside PostgreSQL schema `icecream`.
- Feed-related models are Prisma-lowercase model names such as `user`, `release`, `artist_profile_posts`, `artist_profile_post_comments`, `scene_release_comments`, and `scene_release_likes`.

## Runtime blocker confirmed

- Local `127.0.0.1:5433` is unreachable, so the current `.env.local` breaks `/api/feed` and `/feed` before Prisma can query anything.
- Local PostgreSQL on `localhost:5432` is reachable.
- There is no local `docker-compose.yml`, `docker-compose.*.yml`, `compose.yml`, or similar compose service in the repository root, so there is no documented in-repo container bootstrap for PostgreSQL.
- The only database helper script found is `scripts/setup-local-verification-db.mjs`, and it prepares verification-specific tables only; it is not a full application bootstrap path.

## Schema drift found on localhost:5432

- Database `icecream` already exists on `localhost:5432`.
- That database contains both:
  - `public` legacy tables; and
  - `icecream` schema tables.
- Inside `icecream`, legacy CamelCase tables still exist, including `"User"`, `"Release"`, and `"ArtistProfile"`.
- Newer social tables also exist in `icecream`, for example:
  - `artist_profile_posts`
  - `artist_profile_post_comments`
  - `scene_release_comments`
  - `scene_release_likes`
- `_prisma_migrations` exists in schema `icecream`, but its history shows duplicate and unfinished migration rows, which means the current local database is not a clean canonical development baseline.

## Migration consistency findings

- Early migrations created legacy tables without explicitly targeting schema `icecream`.
- Later migrations, for example `20260523174000_add_missing_analytics_tables_icecream`, explicitly set `search_path` to `icecream` and reference lowercase relations such as `"user"` and `"release"`.
- Current social migrations also explicitly target `icecream` and lowercase relation names.
- Prisma schema currently expects `icecream` as the canonical schema, but the existing local database contains a mixed legacy state with both duplicated schemas and incompatible naming conventions.

## Seed status

- `prisma/seed.ts` seeds general application data and one demo artist/admin flow.
- It is not yet sufficient for end-to-end validation of the feed mini-social-network requirements.
- Additional idempotent development seed data is still needed after a clean schema is restored.

## Testing implications

- Existing typecheck and targeted tests do not prove that the live runtime database is correctly prepared for `/api/feed`.
- Browser or API verification of `/feed` is currently blocked until Prisma can connect to a clean development database with the expected `icecream` schema.

## Recovery decision

- Do not run more migrations against the existing mixed local `icecream` database on `5432`.
- Do not reuse the dead `5433` configuration.
- Preferred recovery path for development:
  1. create a separate, isolated local development database on the reachable PostgreSQL instance at `localhost:5432`;
  2. point only development env variables to that new database using PostgreSQL schema `icecream`;
  3. run Prisma format, validate, migration status, and then apply the existing migrations to the new clean database;
  4. extend seed data for feed and social scenarios;
  5. re-test `/api/feed` and `/feed` on `http://localhost:3002`.
