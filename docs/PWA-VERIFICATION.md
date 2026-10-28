# PWA verification record

Date: 2026-10-28. Base: `cf9f483ab601d9fa1689b0ffbf84195b1230e511`.
Branch: `feature/aoc-pwa`. Tests ran locally on Windows with Node 24.18.0,
Next 16.2.9, React 19.2.7, Prisma 6.19.3 and TypeScript 5.9.3.

This file preserves the original implementation test record below. PR #90 is now
published. The owner subsequently confirmed that VPS is the only production
environment and Vercel/Neon are retired; old integration checks are not deployment
evidence. The current audit, update-detection fix and release gates are recorded in
`VPS-PWA-RELEASE.md` and supersede the historical local-only workflow notes.

## Confirmed

| Check | Result and boundary |
| --- | --- |
| Locked dependency installation | Passed; frozen lockfile, install scripts skipped; no runtime dependency added |
| Prisma client generation | Passed; no migration/seed/bootstrap; unreachable loopback placeholder DB |
| TypeScript | Passed after generating the Prisma client |
| Production build | Passed, Next 16.2.9 Turbopack, including TypeScript and 37 static pages |
| ESLint | No application errors; original unused-variable warnings in schedule-form.tsx and amn/payload.ts |
| PWA contract tests | 7 passed: manifest/icon dimensions, safe install, rejected private/redirect/MIME responses, request bypass, no cached navigation, generic offline 503, cache ownership and explicit activation |
| Existing regression tests | Pilot identity password, Staff permission resolution, Staff recovery/portal protection, Staff navigation, PKCE helper, Staff duplicate-login resolution and native Pilot booking rules passed |
| Real worker behavior | Chrome and Edge local isolated harness passed: registration, static cache allowlist, API/RSC/write exclusions, offline fallback, no write replay, waiting update, explicit activation and old cache cleanup |
| Production UI, Chrome and Edge | Manifest parsed with zero errors; browser installability diagnostics reported zero errors in isolated non-incognito profiles |
| Responsive public pages | Gateway, Pilot login and Staff login at 360/390/412/768/1280/1920px: 18 checks per browser, no page-level horizontal overflow |
| Install interaction | No programmatic prompt until button click; dismissal consumes prompt; installed event and simulated Safari standalone state hide help |
| Update UI | Actual worker v1/v2 served through loopback test proxy: user action reloads the selected window, another window retains its test textarea until its own explicit reload |
| Unauthenticated Pilot guard | Dashboard navigation redirects to Pilot login on local production build |
| Runtime page errors | None in passing public-page browser runs |

## Environment/reproduction notes

- The first type-check was attempted before Prisma generation and failed on missing
  generated Prisma types. It passed after generation; no application workaround was added.
- The first restricted build did not finish compilation and was stopped. The same
  build passed with local child-process execution allowed, sanitized business environment
  variables and only unreachable loopback database URLs.
- Existing build code logs dynamic-server-use messages during static probing and
  reports the deliberate `127.0.0.1:1` database as unreachable. The build exits 0.
  This is compilation evidence, not database/integration acceptance.
- A very long Windows persistent browser-profile path caused Cache Storage install
  to fail with `InvalidAccessError: Entry already exists`. A fresh, short temporary
  profile resolved it. Passing browser tests used real, unmodified worker logic
  (apart from substituting the cache version in the local test proxy for update tests).
- A test initially raced the page reload during update; it now waits for navigation.
- The existing direct Node Staff password test cannot resolve `server-only`, which
  Next normally aliases. It was not counted as a passing authentication integration
  test and no unrelated package/runtime change was made to force it to pass.
- No physical mobile device, Safari/WebKit runtime, authenticated staging account or
  isolated business database was available. No successful authenticated login, booking,
  OAuth, OFP download, PIREP or STRATOS business flow is claimed.

## Remote workflow and remaining gates

The repository workflow `.github/workflows/foqa-v2.yml` runs PR regression tests
against its own PostgreSQL service and has no deployment step. However, the connected
Vercel project's Git context still links `z915084508/hispafly-aoc`, and project details
still list AOC production domains and a production deployment target. The connector
does not expose enough branch-trigger detail here to prove a push/PR is deployment-free.
VPS-side webhook settings were not available. The GitHub CLI's local credential was
also invalid when checked; no credential was printed or changed.

Therefore the implementation is committed **locally only** and review artifacts are
provided. No branch push or PR is attempted until deployment triggers are independently
confirmed safe. No remote settings are changed to bypass this gate. The complete
manual device, authenticated staging, Linux/proxy and release checklist is in `PWA.md`.

No production database, VPS, DNS, SSL, deployment, API contract or authentication
behavior has been changed. Do not label this record as production release approval.
