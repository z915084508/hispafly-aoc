# HISPAFLY AOC PWA

Implementation branch: `feature/aoc-pwa`, based on `main` at
`cf9f483ab601d9fa1689b0ffbf84195b1230e511`. No deployment or production data changes.

## Scope

The existing Next.js 16 App Router portal remains the application. This change adds
installation metadata, official-brand icons, a deliberately small static cache,
installation help and an explicit update action. No authentication, API, permissions,
database schema, dispatch, booking, PIREP, STRATOS, TSAT or CTOT logic changes.
No native package, push notifications or offline operations are introduced.

## Manifest and icons

`src/app/manifest.ts` serves `/manifest.webmanifest`:

| Field | Value |
| --- | --- |
| id / start_url / scope | `/` |
| name | HISPAFLY AOC |
| short_name | HISPAFLY |
| display | standalone |
| theme_color | #07111f |
| background_color | #f5f7fb |
| orientation | omitted, permitting both orientations |
| icons | 192x192, 512x512 any; 512x512 maskable |

`src/app/layout.tsx` adds application/Apple metadata, the 180px Apple Touch Icon,
favicon, theme color and `viewport-fit=cover`. Zoom remains available. The favicon
contains 16, 32 and 48px images. `scripts/generate-pwa-icons.py` (development-only
Python/Pillow) reproducibly crops the existing official emblem from the left of
`public/logo-hispafly-full.png` and adds padding on the existing light brand canvas.
The full logo is unchanged. The maskable mark uses a 60% square to protect the mark
within the maskable safe region. No generated replacement logo or runtime image
dependency is used.

## Cache and update policy

`public/sw.js` is registered only in a production build in a secure context. It uses
root scope and `updateViaCache: none`. `next.config.ts` sets revalidation headers for
the manifest and no-cache/no-store for the worker. Any upstream proxy must preserve
these headers and return actual files, not an authenticated redirect or SPA fallback.

Only these six exact, query-free public URLs enter Cache Storage:

- `/offline.html`
- `/icons/icon-192.png`
- `/icons/icon-512.png`
- `/icons/icon-maskable-512.png`
- `/icons/apple-touch-icon.png`
- `/favicon.ico`

Install-time fetches omit credentials and reject redirects, non-success responses,
opaque responses, unexpected content types and private/no-store responses before
writing. There is no runtime insertion of business responses. Navigation always
uses the network with `cache: no-store`. A network exception returns a generic,
bilingual offline document with status 503 and no-store. HTTP errors are passed
through rather than hidden by an offline page.

APIs, POST/other writes, Server Actions, RSC, prefetches and cross-origin requests
are not handled by the worker. Authenticated HTML, OFPs/PDFs, bookings, flight data,
PIREP history, wallet/profile details, TSAT and CTOT never enter the worker cache.
Next.js scripts/styles are not cached by this worker. No background sync or write
queue exists. The first online visit is required to install the offline fallback;
this is not an offline app shell. Existing in-memory UI and browser history are
still governed by the existing application/browser; this does not replace logout
or server authorization.

For **every worker or allowlisted-asset release**, bump `VERSION` in `public/sw.js`.
New workers wait. The UI checks on page load and visibility return, then offers
Update and reload / Later. No automatic install popup or forced refresh is used.
Save forms before selecting update. Only the selecting window reloads; another
window keeps its unsaved work and can later choose its own reload. Activation
deletes only old `hispafly-aoc-static-*` caches, leaving other applications alone.
All old windows closing also allows the normal browser worker lifecycle to advance.

For rollback, do not assume reverting server files removes an installed worker.
Ship a compatible forward worker with a new cache version, or a reviewed retirement
worker that unregisters and clears only this app's caches. Keep the manifest id,
scope and start URL stable. Never reset users' entire browser storage or cookies.

## Installation

**Windows 10/11, Edge or Chrome:** open the HTTPS portal and use the address-bar
installation icon or browser apps menu. Confirm HISPAFLY AOC. Open from Start or the
taskbar. It should open in an independent window with correct name and icon. Browser
versions vary; Windows/browser versions must themselves be supported by their vendors.

**Android, Chrome:** open the portal, choose Install app (or Install and create
shortcut → Install) in the browser menu, or use the app's install button when offered.
Open from the launcher. Distinguish an installed web app from a plain browser shortcut;
device services and browser support affect the result. Do not promise an APK.

**iPhone/iPad, Safari:** open the portal, tap Share → Add to Home Screen. Enable Open
as Web App if offered. Confirm the title, then launch from the Home Screen. Safari
does not use the Chromium `beforeinstallprompt` flow; in-page help provides these steps.
OS versions may place or label Share differently.

Installation help appears unobtrusively after the page, in Spanish/English. A native
prompt is invoked only after a user clicks the supported installation button. The
button is cleared after that attempt. Help is hidden in standalone display mode,
Safari standalone mode, or after this window receives an installation event. Other
browser profiles/devices can still need their own installation and login.

## Mobile changes

The Pilot sidebar becomes a collapsible menu below 760px, with aria-expanded,
keyboard Escape handling and closing on link selection. Desktop navigation is
unchanged. Targeted rules improve login sizing, 16px mobile inputs (avoiding common
iOS focus zoom), 44px pilot actions, wrapping account summaries, single-column forms,
rank/award layouts, booking filters and contained table/iframe overflow. Body padding
uses safe-area insets. Existing desktop Staff/OCC grids and permissions are preserved.

## Verification and reproduction

Use the lockfile, generate Prisma locally, then run:

```text
node --experimental-strip-types --test scripts/pwa.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build
```

Build in an environment with no real business credentials or `.env` files. For this
review, database URLs pointed to unreachable `127.0.0.1:1`, migrations/bootstrap were
disabled, and `next build` was invoked directly. Do not run `db:deploy`, seed or
bootstrap as PWA validation. Build logs can include the existing dynamic-server-use
and placeholder-DB-unreachable messages; the final exit code determines build success.

Optional browser tests require Playwright as a **test-only** module and installed
Chrome/Edge. It is not an application dependency. Set `AOC_PWA_PLAYWRIGHT` to its module
path if not resolvable normally; `AOC_PWA_BROWSERS=chrome,msedge` selects channels.

```text
node scripts/pwa-worker-browser.test.mjs
node scripts/pwa-browser.test.mjs
```

The worker test uses fake private data and actual worker files on loopback port 3310.
The UI test starts the local production build on 3307, proxies it on 3311, and supplies
worker v1/v2 only through that local proxy to test updates. It uses a new temporary
browser profile (never a personal profile), no auth credentials and a sanitized child
environment with an unreachable database. Ensure these local ports are free. It stops
its local application and browser on completion. Output defaults to ignored
`tmp/pwa-browser`, overridable with `AOC_PWA_TEST_OUTPUT`. Native OS install dialogs
and physical device acceptance remain manual. Use short temporary profile paths on
Windows: an overly long Chromium Cache Storage path caused a local test failure.

## Release gates and manual acceptance

These are not claimed complete by a desktop/headless test run:

- [ ] Map the real VPS release SHA/image to the reviewed branch; inspect current
  Git provider/Vercel/VPS automatic deployment triggers before any push or PR.
- [ ] Test the final Linux image and upstream proxy in an isolated HTTPS staging
  environment with a separate database and stub/test external integrations.
- [ ] Verify `/sw.js`, manifest, icons and offline document return correct bodies,
  MIME types and cache headers through that proxy. Check certificate validity and
  no mixed content. Confirm the manifest stays accessible without login.
- [ ] Windows 10/11 Edge and Chrome: actual install, icon/name, independent window,
  Start/taskbar launch, close/reopen, uninstall/reinstall.
- [ ] Android Chrome: launcher install, touch navigation, keyboard, both orientations,
  background/resume, session expiry, PDF viewing and download behavior.
- [ ] iPhone and iPad Safari: Add to Home Screen, Apple icon, standalone display,
  portrait/landscape, notches/home indicator, keyboard, back navigation and PDF access.
- [ ] In the isolated test database, verify Pilot and Staff login/logout, close/reopen,
  expiration, disabled users, role restrictions and switching accounts.
- [ ] Verify Dashboard/My Next Flight, booking/cancellation, briefing/OFP, PIREPs,
  profile/settings and STRATOS pages against test data. Do not submit to production.
- [ ] Navigraph/SimBrief OAuth return, cancelled/expired authorization and external
  PDF/download flows work using approved test integrations.
- [ ] Offline navigation shows generic help; APIs/operational actions fail honestly;
  reconnect does not replay writes. No private payload appears in Cache Storage.
- [ ] Logout/switch-account/back/relaunch do not expose prior private data; distinguish
  worker-cache tests from browser history/Next in-memory behavior.
- [ ] Version N→N+1, Later, explicit update in two windows, failed installation and
  rollback/retirement-worker recovery pass on actual mobile devices.
- [ ] Desktop OCC navigation, tables, administrative functions and permission checks
  retain their behavior; test on a separate staging database.

No production deployment, push, PR, merge, VPS/DNS/TLS change or database migration
is performed by these local verification steps. The repository remains linked to a
Vercel project; its complete automatic deployment policy must be verified before
publishing this branch. A local commit/review bundle can be inspected without firing
remote deployment hooks.

## References

- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Chrome install criteria](https://web.dev/articles/install-criteria)
- [Edge PWA usage](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/ux)
- [Chrome Android installation](https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid)
- [Safari Home Screen web apps](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios)
