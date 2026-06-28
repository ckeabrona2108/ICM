# Smart Link 2.0

## Status
- Status: proposed
- Date: 2026-06-28
- Scope: product architecture, data model, routing, analytics, SEO, performance, admin and artist UX

## Goal
Сделать Smart Link 2.0 главным публичным entry point для каждого релиза ICECREAMMUSIC:
- одна красивая ссылка на релиз;
- переходы на площадки и follow/share actions;
- глубокая аналитика для владельца релиза;
- архитектура, готовая к presave, merch, concerts, donations и streaming insights.

Это не отдельный микросервис. Это нативный модуль существующей release-системы.

## Current repo fit

### What already exists
- `release` уже содержит базовые публичные данные:
  - `id`
  - `title`
  - `preview`
  - `date`
  - `genre`
  - `performer`
  - `slug`
  - `upc`
  - `roles`
- `track` already stores `explicit`, `track`, `video`, `ringtone`, `index`.
- `user` already stores editable artist links:
  - `telegram`
  - `vk`
  - `personalSiteUrl`
- release platform catalog already exists in [src/lib/release-platforms.ts](/Users/vaceslavsmancar/Desktop/ICM DISTRO/src/lib/release-platforms.ts:1).
- analytics foundation already exists in Prisma:
  - `analytics_daily_summaries`
  - `analytics_platform_summaries`
  - `analytics_report_snapshots`
- primitive promo entities already exist:
  - `promo_links`
  - `promo_urls`

### What is missing
- public Smart Link route;
- destination status model for `live / soon / hidden`;
- click tracking and UTM ingestion;
- device/country/city/source analytics for promo traffic;
- QR generation and downloads;
- artist settings UI for follow/share/theme/order;
- owner dashboard for Smart Link performance;
- SEO metadata generation for public release landing pages.

## Product principles
- Smart Link page is created automatically after release publication.
- The public page must work even if not all DSP links are live yet.
- The release page is promotional first, but analytics-grade under the hood.
- Every external DSP click goes through a tracking redirect endpoint.
- Owner sees analytics without personal data leakage.
- Architecture must support future modules without table rewrites.

## URL strategy

### Primary path
- `https://icecreammusic.net/l/[slug]`

Example:
- `https://icecreammusic.net/l/artist-song`

### Optional future host strategy
- `https://music.icecreammusic.net/[artist]/[release]`

Recommendation:
- launch phase 1 on `/l/[slug]`;
- keep domain-based variant as alias later.

### Slug rules
- slug must be stable after publish;
- slug uniqueness must be global for public promo pages;
- recommended format:
  - `artist-song`
  - fallback collision suffix:
  - `artist-song-6f42`

## User states

### Visitor
- opens public release page;
- sees cover, title, artist, metadata;
- clicks streaming platform buttons;
- can share or follow artist;
- never sees private analytics.

### Release owner
- opens same page publicly;
- can access dashboard analytics from release cabinet;
- can change theme, platform visibility, service order and follow links.

### Admin
- can inspect page status, traffic, DSP destinations and health;
- can override broken links if needed;
- can view aggregate promo analytics.

## Public page structure

### Hero
- cover art
- release title
- artist name
- release date
- genre
- explicit badge if any track or release is explicit

### Primary actions
- large service buttons:
  - Spotify
  - Apple Music
  - Яндекс Музыка
  - VK Музыка
  - YouTube Music
  - Deezer
  - Amazon Music
  - TikTok
  - Скачать WAV if allowed

### Platform states
- `live`: active button with redirect
- `soon`: muted button, label `Скоро`
- `hidden`: not rendered
- `disabled`: owner disabled manually

### Follow block
- Instagram
- TikTok
- Telegram
- YouTube
- VK
- Discord
- Website

### Share block
- WhatsApp
- Telegram
- VK
- X
- Facebook
- Copy Link

### QR block
- preview QR
- download:
  - PNG
  - SVG
  - PDF

## Design direction
- visual level: Spotify x Apple Music x Stripe-grade music landing
- dark-first, minimalist, large spacing
- moderate glass only on surfaces, not everywhere
- heavy accent only on primary actions
- mobile-first
- fast SSR first paint

## Recommended component architecture

### Public page components
- `SmartLinkPage`
- `SmartLinkHero`
- `SmartLinkPlatformGrid`
- `SmartLinkPlatformButton`
- `SmartLinkFollowSection`
- `SmartLinkShareSection`
- `SmartLinkQrCard`
- `SmartLinkFooter`

### Dashboard components
- `ReleaseSmartLinkSettingsCard`
- `SmartLinkThemeSelector`
- `SmartLinkPlatformSorter`
- `SmartLinkFollowLinksForm`
- `SmartLinkAnalyticsOverview`
- `SmartLinkAnalyticsSources`
- `SmartLinkAnalyticsPlatforms`
- `SmartLinkAnalyticsGeo`
- `SmartLinkRecentVisitorsTable`

### Internal service layer
- `smart-link-service.ts`
- `smart-link-analytics-service.ts`
- `smart-link-seo.ts`
- `smart-link-qr.ts`
- `smart-link-redirect.ts`

## Routing

### Public routes
- `src/app/l/[slug]/page.tsx`
  - SSR public landing page
- `src/app/l/[slug]/go/[platform]/route.ts`
  - analytics tracking + redirect
- `src/app/l/[slug]/qr/[format]/route.ts`
  - serves PNG / SVG / PDF

### Dashboard routes
- `src/app/(dashboard)/dashboard/releases/[id]/smart-link/page.tsx`
  - owner settings + analytics

### API routes
- `GET /api/releases/[id]/smart-link`
- `PATCH /api/releases/[id]/smart-link`
- `GET /api/releases/[id]/smart-link/analytics`
- `POST /api/releases/[id]/smart-link/platforms/reorder`
- `POST /api/releases/[id]/smart-link/follow-links`

## Data model strategy

### Decision
Do not create a second parallel link system.

Use existing:
- `promo_links`
- `promo_urls`

and extend them into the canonical Smart Link domain model.

## Prisma schema proposal

### Extend `promo_links`
Recommended fields:
- `slug String @unique`
- `releaseId String @db.Uuid @unique`
- `isPublic Boolean @default(true)`
- `theme String @default("auto")`
- `showQr Boolean @default(true)`
- `allowWaveDownload Boolean @default(false)`
- `serviceOrder Json?`
- `hiddenServiceCodes Json?`
- `followLinks Json?`
- `shareEnabled Boolean @default(true)`
- `lastPublishedAt DateTime?`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

Purpose:
- one Smart Link page per release;
- stores owner-facing presentation settings;
- no duplication of core release metadata.

### Extend `promo_urls`
Recommended fields:
- `platformCode String`
- `label String?`
- `url String`
- `status String @default("soon")`
- `sortOrder Int @default(0)`
- `publishedAt DateTime?`
- `clickCount Int @default(0)`
- `lastClickedAt DateTime?`

Recommended status values:
- `live`
- `soon`
- `hidden`
- `disabled`

Purpose:
- normalized DSP destinations;
- allows activation as soon as platform link is known;
- supports gray `Скоро` buttons without fake URLs.

### New table: `promo_click_events`
Fields:
- `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- `promoLinkId String @db.Uuid`
- `releaseId String @db.Uuid`
- `platformCode String?`
- `eventType String`
- `source String?`
- `medium String?`
- `campaign String?`
- `content String?`
- `term String?`
- `referrerHost String?`
- `country String?`
- `city String?`
- `deviceType String?`
- `osName String?`
- `browserName String?`
- `visitorHash String?`
- `sessionHash String?`
- `createdAt DateTime @default(now())`

Event types:
- `page_view`
- `platform_click`
- `follow_click`
- `share_click`
- `qr_download`
- `wave_download`

Purpose:
- raw immutable analytics ledger;
- no personal data, only anonymized hashes.

### New table: `promo_daily_stats`
Fields:
- `id String @id`
- `promoLinkId String @db.Uuid`
- `releaseId String @db.Uuid`
- `reportDate DateTime`
- `views Int @default(0)`
- `clicks Int @default(0)`
- `ctr Decimal @db.Decimal(7,3)`
- `topPlatform String?`
- `topSource String?`
- `mobileViews Int @default(0)`
- `desktopViews Int @default(0)`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime`

Purpose:
- fast dashboard queries;
- keeps public page analytics cheap;
- supports today/week/month/all-time slices quickly.

### New table: `promo_platform_stats`
Fields:
- `id String @id`
- `promoLinkId String @db.Uuid`
- `releaseId String @db.Uuid`
- `reportDate DateTime`
- `platformCode String`
- `clicks Int @default(0)`
- `sharePercent Decimal @db.Decimal(7,3)`
- `ctr Decimal? @db.Decimal(7,3)`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime`

Purpose:
- “Spotify 1240 / Apple 320 / VK 560” block;
- top-conversion platform logic.

### New table: `promo_geo_stats`
Fields:
- `id String @id`
- `promoLinkId String @db.Uuid`
- `releaseId String @db.Uuid`
- `reportDate DateTime`
- `country String`
- `city String?`
- `views Int @default(0)`
- `clicks Int @default(0)`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime`

Purpose:
- countries and cities analytics without scanning raw events every time.

## Data ownership

### Release stays source of truth for
- title
- artist/performer
- cover
- release date
- genre
- explicit badge source data

### Promo layer owns
- slug
- theme
- ordering
- visible platforms
- follow links
- public analytics
- QR assets

## Link activation flow

### On release publication
System automatically:
1. creates or upserts `promo_links` row for the release;
2. seeds `promo_urls` from selected release platforms;
3. marks each destination as:
   - `soon` by default
   - `live` only if canonical external URL is known
4. publishes page immediately.

### When platform URL becomes known
System:
1. updates matching `promo_urls.url`;
2. changes status to `live`;
3. button becomes active automatically.

This can be done:
- manually by admin at first;
- later via distribution sync/import pipeline.

## Redirect flow

All button clicks must go through:
- `/l/[slug]/go/[platform]`

Steps:
1. load promo page and destination;
2. capture event:
   - UTM
   - referrer
   - device
   - geo headers if available
3. increment fast counters;
4. `302` redirect to DSP URL.

Reason:
- tracking stays reliable;
- external URLs remain owner-editable;
- CTR per platform becomes accurate.

## UTM model

Supported params:
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`

Derived grouped sources:
- `Instagram Stories`
- `Instagram Bio`
- `TikTok Bio`
- `Telegram`
- `Ads`
- `Direct`
- `Google`
- fallback `Other`

Implementation note:
- keep raw UTM in event row;
- compute grouped labels in analytics service.

## Follow links

### Phase 1
Store on `promo_links.followLinks` as JSON:
- `instagram`
- `tiktok`
- `telegram`
- `youtube`
- `vk`
- `discord`
- `website`

### Source defaults
When Smart Link is first created:
- prefill from `user.personalSiteUrl`, `user.telegram`, `user.vk`;
- allow owner override per release.

Reason:
- per-release flexibility without forcing global artist profile redesign now.

## QR generation

### Outputs
- PNG
- SVG
- PDF

### Strategy
- SVG generated server-side from canonical public URL;
- PNG rendered from SVG;
- PDF wraps SVG/PNG into printable one-page layout.

### Caching
- cache by slug and theme;
- regenerate only if slug/theme changes.

## SEO

### Metadata
For each public page generate:
- `<title>`
- meta description
- OpenGraph title
- OpenGraph description
- OpenGraph image
- Twitter card
- canonical URL

### Structured data
Add `MusicRecording` or `MusicAlbum` schema.org JSON-LD:
- name
- byArtist
- image
- genre
- datePublished
- url
- sameAs destinations when `live`

### OpenGraph image
Use release cover as base.

Optional phase 2:
- branded OG template route.

## Performance strategy

### Page rendering
- SSR public page from App Router
- static shell + short data fetch
- revalidate per release page

### Target
- time-to-first-byte and initial render under 1 second on cached path

### Tactics
- keep public query narrow;
- use precomputed counters for analytics dashboard, not public page;
- no client-heavy dashboard code on public page;
- image dimensions fixed;
- QR lazy-loaded below fold if needed.

## Analytics dashboard

### Owner metrics
- total views
- clicks
- CTR
- today
- week
- month
- all time
- top platforms
- top sources
- top countries
- top cities
- desktop vs mobile
- last visitors:
  - timestamp
  - country
  - city
  - device
  - source
  - no IP / no personal data

### Admin metrics
- same plus cross-release monitoring
- broken destinations
- pages with zero live DSPs
- top-performing releases globally

## Privacy and compliance
- do not store raw IP in promo analytics tables;
- if IP is needed transiently for geo or rate-limiting, discard after deriving country/city/hash;
- store only anonymized `visitorHash` / `sessionHash`;
- “last visitors” must stay non-PII.

## Theme system

Values:
- `light`
- `dark`
- `auto`

Phase 1 recommendation:
- implement only `dark` and `auto`;
- `auto` maps to `dark` initially;
- keep schema ready for future theming.

## WAV download rules

Button appears only if:
- owner enables download;
- release file exists;
- release rights allow direct downloadable asset.

Click must also go through tracked route:
- event type `wave_download`

## Future expansion slots

Smart Link 2.0 must leave clear extension points for:
- presave
- merch blocks
- concerts
- donations
- email subscribe
- playlist of artist
- latest releases carousel
- streaming analytics overlay
- recommendations

Recommended extension mechanism:
- `promo_links.modules Json?`

Phase 1 does not need module-builder UI.

## Rollout plan

### Phase 1: foundation
- extend `promo_links` and `promo_urls`
- public page route `/l/[slug]`
- redirect tracking route
- basic owner settings
- QR generation
- page-level SEO metadata

### Phase 2: analytics dashboard
- raw click events
- daily and platform aggregates
- owner dashboard cards and tables
- UTM grouping
- geo/device/source charts

### Phase 3: automation
- automatic DSP activation sync
- better artist follow profiles
- branded OG image generation
- admin monitoring tools

### Phase 4: growth modules
- presave
- merch
- concerts
- donations
- recommendations

## Recommended implementation files

### App routes
- `src/app/l/[slug]/page.tsx`
- `src/app/l/[slug]/go/[platform]/route.ts`
- `src/app/l/[slug]/qr/[format]/route.ts`
- `src/app/(dashboard)/dashboard/releases/[id]/smart-link/page.tsx`
- `src/app/api/releases/[id]/smart-link/route.ts`
- `src/app/api/releases/[id]/smart-link/analytics/route.ts`

### Services
- `src/lib/smart-link-service.ts`
- `src/lib/smart-link-analytics-service.ts`
- `src/lib/smart-link-redirect.ts`
- `src/lib/smart-link-seo.ts`
- `src/lib/smart-link-qr.ts`

### Components
- `src/components/smart-link/*`

### Prisma migration
- extend `promo_links`
- extend `promo_urls`
- add `promo_click_events`
- add `promo_daily_stats`
- add `promo_platform_stats`
- add `promo_geo_stats`

## Risks
- current promo models are underpowered and unused; do not ship half-upgraded logic in both old and new code paths;
- platform URL truth source is not yet clearly defined;
- seed file appears to reference a different historical schema shape and should not be used as source of truth for this module;
- analytics event growth can become large, so daily aggregation is required from the start.

## Recommended acceptance criteria

### Public page
- every published release has a live Smart Link URL;
- inactive DSPs render as `Скоро`;
- live DSPs redirect via tracked endpoint;
- mobile and desktop both render cleanly;
- OG preview looks correct in messengers.

### Owner dashboard
- owner can reorder and hide services;
- owner can edit follow links;
- owner sees total views, clicks, CTR, platforms, sources, countries, devices;
- QR downloads work in PNG/SVG/PDF.

### Technical
- public page renders through App Router SSR;
- no personal visitor data exposed;
- analytics are based on redirect tracking, not guessed;
- schema remains extensible for presave and merch.

## Recommendation
Start implementation by expanding the existing `promo_links` / `promo_urls` layer instead of inventing a second Smart Link model.

This gives:
- lower migration risk;
- native relation to `release`;
- clear rollout path from simple promo link to full Smart Link 2.0;
- future compatibility with presave and campaign analytics.
