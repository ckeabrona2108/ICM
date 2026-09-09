# UX Polish Baseline

Date: 2026-08-01

## Baseline Verification

Verified before UX changes:

- `npm run -s typecheck` -> pass
- targeted tests -> pass
  - `src/lib/__tests__/auth.test.ts`
  - `src/lib/__tests__/artist-profile-search.test.ts`
  - `src/lib/__tests__/feed-scope.test.ts`
  - `src/lib/__tests__/direct-message-service.test.ts`
  - `src/lib/__tests__/dashboard-notification-service.test.ts`
  - `src/lib/__tests__/notification-delivery-service.test.ts`
- `npm run build` -> pass

Known build-time warning preserved for separate handling:

- `/api/playlists` triggers Next.js dynamic server usage warning because it uses `headers()`.
- This is currently non-blocking, but must be explicitly localized and either fixed or documented as expected behavior.

## Existing Stable Flows

Already confirmed through real browser UI before this baseline stage:

- existing seeded user login works
- invalid password shows inline error
- session survives reload
- session survives new tab
- logout returns public header state
- authenticated public header shows avatar/dropdown
- global search finds:
  - posts
  - releases
  - artists
  - groups
  - labels
- search result navigation is correct
- guest auth-gate blocks follow/reaction/comment/contact
- reactions persist after reload
- comments persist after reload
- follows persist after reload
- artist profile opens correctly
- direct messages persist after reload
- direct-message notifications open the correct conversation
- notification read-state updates correctly

## Baseline Screenshots

Captured successfully:

- [desktop-home.png](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/screenshots/ux-baseline/desktop-home.png)
- [desktop-feed.png](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/screenshots/ux-baseline/desktop-feed.png)
- [desktop-search-dropdown.png](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/screenshots/ux-baseline/desktop-search-dropdown.png)
- [desktop-post-detail.png](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/screenshots/ux-baseline/desktop-post-detail.png)
- [desktop-release-detail.png](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/screenshots/ux-baseline/desktop-release-detail.png)
- [desktop-artist-profile.png](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/screenshots/ux-baseline/desktop-artist-profile.png)

Still missing from the baseline set:

- desktop messages
- desktop notifications
- mobile feed
- mobile search
- mobile profile
- mobile messages

Reason:

- the dedicated baseline screenshot automation hit a transient browser-login capture failure after repeated auth attempts, while the main social browser E2E had already been confirmed earlier.
- this does not indicate a confirmed product regression in the validated social flow, but it does indicate that baseline screenshot capture for authenticated/mobile states must be re-run with stabilized auth setup before the polish phase is considered fully documented.

## Visual Inconsistencies

### Shared Tokens Are Fragmented

Current UI uses multiple overlapping token systems:

- generic dashboard tokens in [globals.css](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/app/globals.css)
- dedicated feed tokens in the same file
- many local hardcoded colors and shadows in:
  - [public-feed-page.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx)
  - [feed-audio-player.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/feed-audio-player.tsx)
  - [artist-profile-social.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/landing/artist-profile-social.tsx)
  - [direct-messages-panel.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/messages/direct-messages-panel.tsx)
  - [dashboard-topbar.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/layout/dashboard-topbar.tsx)
  - [icm-header.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/landing/icm-header.tsx)

Observed pattern:

- several purple variants: `#7b3df5`, `#7b61ff`, `#8b5cf6`, `#a99bff`
- several dark surfaces: `#0d0f16`, `#111323`, `#141824`, `rgba(15,17,28,0.88)`, `rgba(22,24,38,0.82)`
- repeated bespoke shadows and radii
- repeated control heights with slightly different values

Impact:

- same semantic control looks different between feed, profile, header menus, messages, and release/player sections
- cross-screen navigation feels like moving between related but not identical products

### Buttons And Pills Drift Visually

Most noticeable drift:

- Follow buttons differ between feed, profile, and release/post contexts
- `Связаться`, `Войти`, `Опубликовать`, `Отправить`, and comment submit buttons do not share one control language
- reaction controls are compact in some places but oversized pill-like blocks in others
- some actions use full pills where a standard rounded button would be lighter and clearer

### Search Dropdown Is Functionally Correct But Visually Fragile

Confirmed baseline issue during screenshot capture:

- search result click can be intercepted by the sticky right rail on desktop

This suggests:

- floating layer z-index and hit-testing are not fully stable
- dropdown feels detached from the rest of the platform

Also visible from code:

- result rows across posts/releases/entities use different densities and affordances
- many rows are still visually heavier than necessary for a global quick-search control

### Feed, Detail, Profile, Messages, Notifications Use Different Surface Weight

Current differences:

- feed cards use one glass/dark mix
- profile blocks use another
- messages panel is softer and rounder than adjacent dashboard surfaces
- notification menu uses its own floating panel system

Result:

- each screen is individually acceptable, but the path
  `search -> feed/profile -> contact -> messages -> notifications`
  does not yet feel like one continuous system

## Loading / Empty / Error Inconsistencies

Current inconsistencies to normalize:

- loading feedback varies between full waits, inline spinners, and silent state changes
- search has a loading indicator, but other surfaces still rely on less explicit pending patterns
- some empty states are styled as dashed cards, some as muted text blocks, some as bare text
- error presentation varies:
  - inline rounded alert blocks
  - plain text
  - silent failure fallback in some fetch flows

Priority pages for unification:

- feed
- following feed
- search dropdown
- profile releases
- profile posts
- messages
- notifications
- comments

## Mobile Defects And Risks

Already visible or strongly implied from current implementation:

- many controls are built from desktop-first floating surfaces and may be too dense on mobile
- dropdown/floating panels likely need safer screen-edge behavior
- header and menus rely on fixed layers and multiple overlays, so mobile overlap risk remains
- the feed and profile surfaces use many rounded containers with nested padding, which can compress content too aggressively on smaller widths

Explicit mobile baseline still needs final screenshot confirmation for:

- feed
- search
- profile
- messages

## Accessibility Gaps To Check During Polish

Do not remove existing semantics. Focus on consistency gaps:

- keyboard navigation through global search rows
- Escape and focus restore in floating menus
- visible focus consistency across feed actions, header menu, notifications, and messages
- clear pending/error announcement on comments/messages
- hover-only affordances that need keyboard-visible equivalents
- active/unread state visibility without relying only on color

## Structural Boundaries

These areas are stable and should not be structurally rewritten during polish:

- feed routing and ordering
- search entity/result contract
- auth/session behavior
- follow/reaction/comment/message/notification semantics
- profile data sections and routing
- message model and conversation routing
- notification link semantics and read-state behavior
- release detail data model and audio lifecycle

Pages/components that should be visually unified without structural redesign:

- [public-feed-page.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx)
- [feed-detail-page.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/feed-detail-page.tsx)
- [artist-profile-social.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/landing/artist-profile-social.tsx)
- [direct-messages-panel.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/messages/direct-messages-panel.tsx)
- [dashboard-topbar.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/layout/dashboard-topbar.tsx)
- [icm-header.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/landing/icm-header.tsx)

## Immediate Polish Priorities

1. Normalize shared design tokens in [globals.css](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/app/globals.css) and stop local color/radius/shadow drift.
2. Unify primary controls:
   - Follow
   - Связаться
   - Войти
   - Отправить
   - comment submit
   - reaction controls
3. Unify floating UI:
   - search dropdown
   - user menu
   - notification menu
4. Unify state components:
   - loading
   - empty
   - error
   - auth prompt
5. Reduce visual heaviness:
   - fewer oversized pills
   - fewer double borders
   - lighter nested dark surfaces
6. Re-run baseline screenshots after auth capture is stabilized.
