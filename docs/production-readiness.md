# Production Readiness

## Supported Runtime

- Node.js: `20.x`
- npm: `10.x` or newer
- PostgreSQL: `16.x`

The repository currently builds in Docker with `node:20-bookworm-slim`. Local audit on August 1, 2026 confirmed that `next build` and `next start` are stable when the same runtime uses a clean production `.next` directory.

## Install, Build, Start

Install:

```bash
npm ci
```

Build:

```bash
npm run clean
npm run build
```

Start:

```bash
npm run start -- --hostname 127.0.0.1 --port 3002
```

Do not run `next dev` and `next start` against the same `.next` directory at the same time. The development server emits a different server artifact layout than production, and mixed artifacts are the primary cause of the previously observed vendor-chunk and missing-module failures.

## Required Environment Variables

Use `.env.example` as the canonical template. `.env.local` must stay uncommitted and must only override local runtime values intentionally.

| Variable | Required | Server/Public | Dev | Staging | Production |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Server | Yes | Yes | Yes |
| `DIRECT_URL` | Yes | Server | Yes | Yes | Yes |
| `NEXTAUTH_SECRET` | Yes | Server | Yes | Yes | Yes |
| `NEXTAUTH_URL` | Yes | Server | Yes | Yes | Yes |
| `NEXT_PUBLIC_APP_URL` | Recommended | Public | Yes | Yes | Yes |
| `ADMIN_EMAILS` | Recommended | Server | Optional | Yes | Yes |
| `SEED_USER_EMAIL` | Dev only | Server | Optional | No | No |
| `SEED_USER_PASSWORD` | Dev only | Server | Optional | No | No |
| `SEED_ADMIN_EMAIL` | Dev only | Server | Optional | No | No |
| `SEED_ADMIN_PASSWORD` | Dev only | Server | Optional | No | No |
| `S3_ENDPOINT` | If storage enabled | Server | Optional | Yes | Yes |
| `S3_REGION` | If storage enabled | Server | Optional | Yes | Yes |
| `S3_BUCKET` | If storage enabled | Server | Optional | Yes | Yes |
| `S3_ACCESS_KEY_ID` | If storage enabled | Server | Optional | Yes | Yes |
| `S3_SECRET_ACCESS_KEY` | If storage enabled | Server | Optional | Yes | Yes |
| `NEXT_PUBLIC_S3_URL` | If public media enabled | Public | Optional | Yes | Yes |
| `SMTP_HOST` | If email enabled | Server | Optional | Yes | Yes |
| `SMTP_PORT` | If email enabled | Server | Optional | Yes | Yes |
| `SMTP_SECURE` | If email enabled | Server | Optional | Yes | Yes |
| `SMTP_USER` | If email enabled | Server | Optional | Yes | Yes |
| `SMTP_PASS` | If email enabled | Server | Optional | Yes | Yes |
| `SMTP_BZ_HOST` | If Brevo relay enabled | Server | Optional | Optional | Optional |
| `SMTP_BZ_PORT` | If Brevo relay enabled | Server | Optional | Optional | Optional |
| `SMTP_BZ_SECURE` | If Brevo relay enabled | Server | Optional | Optional | Optional |
| `SMTP_BZ_USER` | If Brevo relay enabled | Server | Optional | Optional | Optional |
| `SMTP_BZ_PASSWORD` | If Brevo relay enabled | Server | Optional | Optional | Optional |
| `SMTP_FROM_EMAIL` | If email enabled | Server | Optional | Yes | Yes |
| `SMTP_FROM_NAME` | If email enabled | Server | Optional | Yes | Yes |
| `WEB_PUSH_SUBJECT` | If push enabled | Server | Optional | Optional | Optional |
| `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` | If push enabled | Public | Optional | Optional | Optional |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | If push enabled | Server | Optional | Optional | Optional |
| `TELEGRAM_BOT_TOKEN` | If Telegram notifications enabled | Server | Optional | Optional | Optional |
| `TELEGRAM_ADMIN_CHAT_ID` | If Telegram notifications enabled | Server | Optional | Optional | Optional |
| `TELEGRAM_BONUS_BOT_SECRET` | If bonus bot enabled | Server | Optional | Optional | Optional |
| `TELEGRAM_BONUS_JWT_SECRET` | If bonus bot enabled | Server | Optional | Optional | Optional |
| `TELEGRAM_BONUS_BOT_USERNAME` | If bonus bot enabled | Server | Optional | Optional | Optional |
| `YOOKASSA_SHOP_ID` | If payments enabled | Server | Optional | Yes | Yes |
| `YOOKASSA_SECRET_KEY` | If payments enabled | Server | Optional | Yes | Yes |
| `YOOKASSA_WEBHOOK_SECRET` | If payments enabled | Server | Optional | Yes | Yes |
| `AI_PROVIDER` | If AI Studio enabled | Server | Optional | Optional | Optional |
| `MISTRAL_API_KEY` | If Mistral enabled | Server | Optional | Optional | Optional |
| `MISTRAL_BASE_URL` | If Mistral enabled | Server | Optional | Optional | Optional |
| `MISTRAL_MODEL` | If Mistral enabled | Server | Optional | Optional | Optional |
| `MISTRAL_FALLBACK_MODEL` | If Mistral enabled | Server | Optional | Optional | Optional |
| `DEEPSEEK_API_KEY` | If DeepSeek enabled | Server | Optional | Optional | Optional |
| `DEEPSEEK_BASE_URL` | If DeepSeek enabled | Server | Optional | Optional | Optional |
| `DEEPSEEK_MODEL` | If DeepSeek enabled | Server | Optional | Optional | Optional |
| `DEEPSEEK_FALLBACK_MODEL` | If DeepSeek enabled | Server | Optional | Optional | Optional |
| `FAL_KEY` | If FAL enabled | Server | Optional | Optional | Optional |
| `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` | If Yandex maps enabled | Public | Optional | Optional | Optional |

### Audit Notes

- `.env.local` is ignored by Git and must remain that way.
- On this repository state, `.env.local` overrides the database target used by Next.js runtime.
- Production secrets must not reuse local SMTP, Telegram, AI, or audit credentials.
- Seed credentials must never be set in staging or production.
- No `NEXT_PUBLIC_*` variable should contain secrets.

## Database Migration Command

Validate:

```bash
npx prisma validate
```

Deploy migrations:

```bash
npm run prisma:migrate:deploy
```

Do not use `npm run prisma:migrate` in production. That command maps to `prisma migrate dev`.

## Seed Policy

- `prisma/seed.ts` is for development/bootstrap only.
- Do not run `npm run prisma:seed` automatically in staging or production.
- Keep seed credentials environment-scoped and temporary.

## Health Check

Endpoint:

```text
GET /api/health
```

Expected success response:

```json
{
  "status": "ok",
  "database": "ok",
  "timestamp": "2026-08-01T22:00:00.000Z"
}
```

Expected failure behavior:

- HTTP `503`
- `status: "degraded"`
- `database: "unreachable"`

The endpoint does not expose schema names, counts, or credentials and performs a read-only database check.

## Backup and Restore

Backup:

```bash
pg_dump -Fc -f /tmp/icm-runtime-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"
```

Restore into a disposable database:

```bash
createdb icm_runtime_restore_$(date +%Y%m%d_%H%M%S)
pg_restore --no-owner --no-privileges -d icm_runtime_restore_YYYYMMDD_HHMMSS /tmp/icm-runtime-YYYYMMDD-HHMMSS.dump
```

Verification checklist after restore:

- `icecream."user"`
- `icecream.release`
- `icecream.artist_profile_posts`
- `icecream.artist_profile_post_comments`
- `icecream.artist_profile_post_likes`
- `icecream.artist_profile_followers`
- `icecream.ai_user_notifications`
- `icecream.direct_conversations`
- `icecream.direct_messages`
- `icecream."SupportTicket"`
- `icecream."Message"`

## Deployment Order

1. Stop only the current project processes that use the target `.next`.
2. Create a database backup.
3. Install dependencies with `npm ci`.
4. Run `npx prisma validate`.
5. Run `npm run prisma:migrate:deploy`.
6. Build with `npm run clean && npm run build`.
7. Start with `npm run start`.
8. Check `GET /api/health`.
9. Run production smoke on public and authenticated routes.

## Rollback Plan

1. Stop the new application process.
2. Restore the previous application build or image.
3. If the failure is schema-related and rollback is required, restore from the latest verified backup into a replacement database.
4. Point the application back to the previous healthy database only after integrity verification.
5. Re-run `/api/health` and production smoke.

Do not attempt ad hoc destructive rollback SQL directly on the primary database.

## Production Smoke Checklist

Public:

- `/`
- `/feed`
- `/feed/[id]`
- `/news/[slug]`
- `/scene?releaseId=...`
- `/artists/[slug]`
- `/login`
- `/api/health`

Authenticated:

- dashboard home
- profile/settings
- playlists
- releases
- messages
- notifications dropdown
- logout

API:

- `/api/search`
- `/api/feed`
- `/api/feed/[id]`
- comment mutations
- reaction mutations
- follow mutations
- `/api/messages`
- `/api/messages/conversations`
- `/api/playlists`
- `/api/dashboard/notifications`

Static/runtime:

- no `_next/static` 404
- no missing vendor chunks
- no hydration errors
- no Prisma runtime errors
- no unexpected `500`

## CI / Regression Command Set

```bash
npm ci
npx prisma validate
npm run -s typecheck
./node_modules/.bin/tsx --test src/lib/__tests__/auth.test.ts src/lib/__tests__/playlists-route.test.ts src/lib/__tests__/direct-message-service.test.ts src/lib/__tests__/dashboard-notification-service.test.ts src/lib/__tests__/support-service.test.ts src/lib/__tests__/artist-profile-search.test.ts src/lib/__tests__/feed-scope.test.ts
npm run build
npm run start -- --hostname 127.0.0.1 --port 3002
```

Browser smoke should run only after the production server is ready and should target a single origin.

## Known Limitations

- This repository currently uses the default `.next` output; there is no standalone production bundle.
- Running `next dev` and `next start` concurrently against the same working tree is unsafe.
- The runtime database may contain a valid schema before Prisma migration metadata is restored; in that case, baseline the ledger before relying on `migrate status`.
- Local runtime configuration can be unintentionally redirected by `.env.local` overrides if they are not reviewed before deployment.
