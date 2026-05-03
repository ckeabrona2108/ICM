# ICM SaaS Platform (MVP)

ICM is a premium dashboard-first music-tech SaaS for artists, producers and labels.

## Implemented scope

- Authentication: `/login`, `/register` (NextAuth credentials + Prisma users)
- Landing page: `/`
- User dashboard module:
  - `/dashboard`
  - `/dashboard/releases`
  - `/dashboard/releases/new` (5-step wizard)
  - `/dashboard/releases/[id]`
  - `/dashboard/statistics`
  - `/dashboard/finance`
  - `/dashboard/ai-studio`
  - `/dashboard/marketing`
  - `/dashboard/messages`
  - `/dashboard/profile`
  - `/dashboard/subscription`
  - `/dashboard/support`
- Admin module:
  - `/admin`
  - `/admin/releases`
  - `/admin/users`
  - `/admin/payments`
- Prisma schema with required entities
- Mock data layer for fast UI development
- S3-compatible upload presign endpoint

## Tech

- Next.js App Router + TypeScript
- Tailwind CSS
- shadcn-style UI components
- Framer Motion
- Prisma + PostgreSQL
- NextAuth
- Zustand

## Quick start

1. Install dependencies
```bash
npm install
```

2. Configure environment
```bash
cp .env.example .env
```

Set Supabase connection strings in `.env`:
1. Open Supabase: `Project Settings -> Database -> Connection string`.
2. Copy:
- `DATABASE_URL`: Transaction pooler (`pooler`, port `6543`)
- `DIRECT_URL`: Direct connection (`db.<project-ref>.supabase.co`, port `5432`)
3. URL-encode DB password if it has special characters (`@`, `#`, `%`, `:`).

Optional seed credentials in `.env`:
```env
SEED_USER_EMAIL="user@local.icm"
SEED_USER_PASSWORD="change-this-password"
SEED_ADMIN_EMAIL="admin@local.icm"
SEED_ADMIN_PASSWORD="change-this-admin-password"
```

Telegram notifications for new support tickets:
1. Create a bot via `@BotFather` and copy token.
2. Add bot to your admin chat (group/channel/private chat).
3. Send any message into that chat.
4. Get chat id:
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"
```
Use `result[].message.chat.id` (for groups usually negative, e.g. `-100...`).
5. Put values into `.env`:
```env
TELEGRAM_BOT_TOKEN="123456:abc..."
TELEGRAM_ADMIN_CHAT_ID="-1001234567890"
```
6. Restart app and run test request as admin:
```bash
curl -X POST http://localhost:3000/api/admin/support/telegram/test
```

3. Generate Prisma client and run migrations
```bash
npm run prisma:generate
npm run prisma:migrate
```

If migration is already applied in shared/production Supabase, use:
```bash
npm run prisma:migrate:deploy
```

4. Seed demo data
```bash
npm run prisma:seed
```

5. Run development server
```bash
npm run dev
```

Open `http://localhost:3000`.

## Project structure

```text
.
├── docs/
│   ├── architecture.md
│   ├── product-analysis.md
│   └── ui-kit.md
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── store/
│   └── types/
├── .env.example
├── package.json
└── README.md
```

## Backend integration roadmap

1. Replace mock arrays in `src/lib/mock-data.ts` with Prisma queries/API clients.
2. Add NextAuth Prisma adapter for persistent users/sessions.
3. Save release wizard payload to DB and move uploads to real S3 bucket.
4. Connect analytics and finance ingestion pipelines.
# icm
# ICM2
