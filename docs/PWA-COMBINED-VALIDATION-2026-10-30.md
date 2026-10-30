# PWA and security baseline validation — 2026-10-30

Local development branch: `dev/pwa-security-validation-20261030`.
Inspected PR #90 at `7c7ba45d09e02f38469ded4cf399b82dee101ba4`
and draft security PR #91 at `aa7ec70b4c3b10c3fa3974a7d190d5100f37b026`.
Both PRs remain open and unmerged. This local branch combines their code for review;
it does not change either remote branch or constitute approval of PR #91.

## Changes

- Retain PR #90's stable root manifest, official 192/512/maskable/Apple icons,
  responsive Pilot navigation and forms, install help, and explicit update UI.
- Retain its exact six-file public cache allowlist. Authenticated HTML, API/RSC,
  credentials, booking/SimBrief/STRATOS data and writes are never put in Cache Storage.
  Offline navigation returns a generic no-store 503; writes are never queued.
- Preserve all three package test entries when resolving the package.json conflict:
  `test:pwa`, `test:build-safety`, `test:security-dependencies`.
- Preserve PR #91's patched lockfile/dependencies, safe build wrapper, manual migration
  guards and manual-only isolated SQL job. No SQL job or migration was run.
- Add PWA contract tests to the automatic FOQA test job alongside build safety.
- Fix the browser report's hardcoded historical date to record the actual test time.

No application business source or Prisma schema/migrations differ from PR #91.
No new runtime dependencies were introduced beyond the already reviewed PR baselines.

## Local evidence

Windows, Node 24.18.0; frozen pnpm install with install scripts disabled.
Locked Next 16.4.3, React/DOM 19.2.9, Prisma/client 6.19.3, Nodemailer 10.1.4.

| Check | Result |
| --- | --- |
| Production build | PASS, `npm run build`; both retired migration/bootstrap flags deliberately true; safe wrapper strips them |
| Database isolation | Only unreachable `127.0.0.1:1` placeholders; no database service, schema operation, seed or bootstrap |
| TypeScript | PASS, `node node_modules/typescript/bin/tsc --noEmit` |
| ESLint | PASS, zero errors; three existing warnings in schedule-form, weekly-planner and AMN payload |
| PWA contracts | 8 passed |
| Build/migration safeguards | 19 passed; migration authorization uses mock CLI only |
| Security dependency compatibility | 3 passed, in-memory identity and mail stream; no SMTP |
| Current pnpm audit, all / production | Both report no known vulnerabilities |
| Real worker, Chrome / Edge | PASS: private/API/RSC/write bypass, static-only cache, generic offline 503, no replay, waiting update, scoped cleanup |
| Built app, Chrome / Edge | PASS: manifest and installability diagnostics have zero errors |
| Responsive public UI | PASS: gateway, Pilot and Staff login at 360/390/412/768/1280/1920 pixels, 18 cases per browser |
| Install/update interaction | PASS: user-triggered prompt, installed help hidden, explicit reload, other-window unsaved work retained, frontend-only release detected without credentials |
| Identity / Staff | Password, access resolution, navigation and protection scripts passed |
| Booking | Native booking, departures, scheduled booking, self-dispatch and roster contracts passed |
| SimBrief | Client (stubbed), PDF URL and OFP-v2 contracts passed |
| STRATOS / ACARS | Access, completion, release channels, FOQA scoring/events and AMN contracts passed |
| Business source comparison | `git diff origin/pr91 -- src/lib src/app/pilot prisma` is empty |

The first build failed because restricted networking could not download the Prisma
build executable. Retrying with download/child-process access succeeded. Expected
unreachable-database/static-probing diagnostics appeared; build exit code was 0.
The first TypeScript command used Corepack and hit its network lookup; invoking the
installed compiler directly passed. These are environment limitations, not bypassed checks.

## Remaining gates

- Physical Windows installation and Android Chrome/tablet installation/launch,
  orientation, keyboard, safe areas and device update acceptance are not verified.
  Headless desktop installability and narrow viewports do not substitute for them.
- Authenticated login, booking, actual SimBrief download and STRATOS end-to-end flows
  require approved test accounts/integrations and an isolated test environment.
  Stub/rule tests do not establish that operational acceptance.
- Review PR #91 and this combined diff before any release. Verify the actual VPS
  artifact and proxy behavior, previous artifact retention and worker rollback using
  `VPS-PWA-RELEASE.md`; no VPS connection was attempted for this task.
- No branch push was performed: historical hosting/webhook deployment triggers are
  not proven disabled, and the user expressly prohibited deployment. No remote PR,
  workflow, protection, hosting, database or production setting was changed.

The development result is reviewable locally and as a Git bundle. It is not a
production release approval. No deployment, PR merge, database operation or VPS
change was performed.
