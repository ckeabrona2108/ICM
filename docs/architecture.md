# ICM Architecture

## Stack

- Next.js App Router (TypeScript)
- Tailwind CSS + shadcn-style component system
- Framer Motion for motion primitives
- Prisma + PostgreSQL
- NextAuth (credentials now, provider/adapter ready)
- Zustand for client-side release wizard state
- S3-compatible upload presign endpoint

## High-level layout

- `src/app` - routing, pages, API handlers
- `src/components` - UI kit + domain components
- `src/lib` - auth, formatting, mock data, Prisma client, S3 helpers
- `src/store` - local client state
- `prisma` - schema and seed
- `docs` - product/architecture/UI docs

## Dashboard-first module boundaries

1. Auth boundary
- `/login`, `/register`
- Session via NextAuth

2. User workspace (`/dashboard/*`)
- Overview
- Releases + wizard
- Statistics
- Finance
- AI Studio
- Marketing
- Messages/Support
- Profile
- Subscription

3. Admin workspace (`/admin/*`)
- Moderation queue
- User list
- Payments

4. Data layer
- Prisma models map to product entities
- Mock data used in UI now; ready to replace with API queries

## API readiness

- `POST /api/uploads/presigned`: returns upload target for S3-compatible storage.
- Next step: replace mock arrays with server actions or REST/GraphQL endpoints.

## Security and roles

- Auth enforced in dashboard/admin layouts.
- Admin routes additionally require `session.user.role === "ADMIN"`.

## Extensibility path

1. Add Prisma adapter for NextAuth.
2. Move release wizard submit to `POST /api/releases` with DB persistence.
3. Add queue worker for moderation and platform distribution status sync.
4. Replace mock analytics with warehouse/BI ingestion.
