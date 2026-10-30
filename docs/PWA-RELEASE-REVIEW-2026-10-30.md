# PWA release review — 2026-10-30

Decision: **GO for draft review; NO-GO for production deployment.**

## Verified source and scope

- Branch: `dev/pwa-security-validation-20261030`.
- Implementation verified: `52dc3bff6ce72cb83eed65d4b75abab0c420de1c`.
- Remote default `main`: `cf9f483ab601d9fa1689b0ffbf84195b1230e511`.
- PR #90: `7c7ba45d09e02f38469ded4cf399b82dee101ba4`.
- PR #91: `aa7ec70b4c3b10c3fa3974a7d190d5100f37b026`.

All three remote refs are ancestors of the implementation. The working tree was
clean before this documentation follow-up. A non-mutating merge-tree check against
latest main succeeded. No duplicate reapplication is needed: the branch includes
the original PWA and security commits. Review this combined PR as an alternative
integration path; do not independently reapply the same patches from #90/#91.
Those PRs remain open and unmerged.

PWA implementation files match #90. Prisma, business logic under `src/lib` and
`src/app/pilot`, patched lock/overrides and safe build/migration scripts match #91.
The integration resolved only the package-script conflict, preserving all three
test commands. It added PWA CI coverage and corrected browser-report timestamps.
The extra `next-env.d.ts` line is inherited from #91, not an unrelated runtime change.

Heuristic scanning of all 42 changed tracked files found no private-key blocks,
GitHub/provider/AWS token patterns, non-placeholder credentialed PostgreSQL URLs,
environment files or conflict markers. This is not a comprehensive history scan
or proof that no secret exists anywhere. Only `.env.example` is tracked, unchanged.

## Repeated local validation

| Check | Result / limits |
| --- | --- |
| Production build | PASS, safe `npm run build`; migration/bootstrap flags deliberately true; only unreachable loopback DB URLs |
| TypeScript | PASS, installed compiler `--noEmit` |
| ESLint | Zero errors; three existing warnings in schedule-form, weekly-planner and AMN payload |
| PWA contracts | 8 passed; manifest identity, 192/512/maskable PNG dimensions, 180px Apple icon and ICO structure |
| Build safety | 19 passed; migration authorization uses mocks, no actual migration |
| Dependency compatibility | 3 passed; in-memory identity, mail stream and Prisma config compatibility |
| Dependency audit | Full and production pnpm audits: no known vulnerabilities at test time |
| Business scripts | Identity, Staff access/navigation/protection, native Pilot booking, SimBrief client/PDF/OFP-v2, ACARS access/completion/channels, FOQA and AMN all passed |
| Worker, Chrome and Edge | Static-only cache; private/API/RSC/write bypass; generic offline 503; no write replay; waiting update and scoped cache cleanup |
| Built UI, Chrome and Edge | Manifest/installability diagnostics, 18 public layout cases per browser, explicit install/update interactions, other-window form preservation and frontend-only release checks |

Browser checks use fresh headless Windows Chrome/Edge profiles, localhost and fake
data, not native OS installation or physical Android. Automated layout coverage is
gateway/Pilot login/Staff login at 360, 390, 412, 768, 1280 and 1920 pixels.
Localhost is a secure-context exception; this does **not** validate TLS, production
proxy headers or Android Chrome. Authenticated business flows remain untested end to end.

## Security and production boundaries

- PR #91 dependency fixes and narrow overrides are retained. Ordinary builds only
  generate the Prisma client and compile Next; they strip retired write flags.
  Startup has no database lifecycle hook. No schema/migration differs from main:
  this release requires no migration, seed or staff bootstrap.
- Worker Cache Storage accepts only six exact public offline/icon URLs. Install
  fetches omit credentials and reject redirects, private/no-store responses and
  unexpected MIME types. Authenticated HTML, API/RSC, OFP/PDF, bookings and STRATOS
  data are not cached. No offline business writes or background replay exist.
- Public release requests omit credentials; the version endpoint exposes only
  `buildId` with no-store. Users choose when to reload; other windows retain forms.
- No production variable/secret was read or changed. `.env.example` is unchanged.
  This confirms no action by this task; it is not a remote configuration-drift audit.
  No VPS connection, container/network/service change, database access, migration,
  restart, deployment or historical Review environment was performed.
- Read-only repository webhook listing returned no hooks. This branch's push is
  outside the FOQA push filter; PR jobs have no deploy steps and use unreachable
  test DB URLs. SQL validation is manual-only/default off and was not dispatched.
  An old Vercel failure remains on #90; do not rerun/reconnect it or treat it as VPS
  evidence. External GitHub App settings are not comprehensively proven disabled.
  Publication is expressly authorized; no infrastructure settings are changed.

## Device testing without production or paid infrastructure

Use an existing development Windows PC and the local production build, isolated
browser profiles, fake accounts/data and stub external integrations. No production
origin, cookies, credentials, scheduled jobs or external operational writes.

1. Windows: serve the built app on loopback and open it in normal fresh Chrome and
   Edge profiles. Localhost supports service workers as a secure development origin.
2. Android: connect an existing phone/tablet by USB, enable USB debugging, authorize
   the PC, and use Chrome DevTools `chrome://inspect/#devices` port forwarding to
   map a device localhost port to the PC's local app port. Open that localhost URL
   in Android Chrome and record `window.isSecureContext`, worker state and actual
   install menu behavior. Revoke USB debugging authorization after testing.
3. Loopback tests do not prove HTTPS. For TLS/cookie/proxy acceptance, use an existing
   isolated nonproduction HTTPS host, or a local HTTPS proxy with a development CA
   trusted by the dedicated test PC/device profile. Never bypass certificate errors
   or disable browser security; do not alter production DNS/TLS. If no such test
   setup exists, keep HTTPS acceptance blocked rather than create paid infrastructure.
4. Full business acceptance needs separately approved test accounts and isolated
   test data/integrations. Preparing this plan does not authorize database creation,
   migrations or external writes. Current unreachable placeholders allow only
   public UI/install/cache checks.

References: [Chrome Android port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server),
[W3C worker secure contexts](https://www.w3.org/TR/service-workers/).

### Manual acceptance record (all pending)

For each client record device/OS/browser version, tested SHA/buildId, origin,
date, tester, screenshots and pass/fail evidence.

- [ ] Windows Chrome AND Edge: install from browser, correct HISPAFLY name/icon,
  standalone window, Start/taskbar launch, close/reopen, uninstall/reinstall.
- [ ] Android Chrome phone AND target tablet: actual install, launcher icon,
  standalone launch, portrait/landscape, touch/keyboard, scroll, safe areas,
  background/resume and OFP/PDF external viewing/download.
- [ ] HTTPS: trusted certificate, no mixed content, real proxy manifest/icon/worker
  MIME and scope; public files accessible without login; worker response is JS,
  not an auth redirect; worker revalidation and version endpoint no-store preserved.
- [ ] Test Pilot/Staff auth: login, logout, reopen, expiration, disabled user,
  permissions, account switch, back navigation; no prior-account data exposure.
- [ ] Test booking/cancellation/self-dispatch; SimBrief success/cancel/expired auth
  and OFP/PDF; STRATOS/ACARS telemetry/PIREP chain with approved test integrations.
- [ ] Inspect Cache Storage after those flows: only the six public entries; no
  credentials/private payloads. Offline navigation is generic; writes fail honestly
  and reconnect never replays them. Check browser history separately from SW cache.
- [ ] N to N+1 with unchanged worker: release notice, Later/re-reminder, save then
  explicit reload; two windows preserve independent forms. Repeat with changed
  worker, failed install, offline/reconnect and background/resume.
- [ ] Rehearse rollback with an already-installed older client, not just a fresh
  browser; confirm no global browser-data/cookie clearing is needed.

## Production checklist — plan only, requires later approval

- [ ] Review the combined security/PWA diff and latest head CI, resolve failures;
  no automatic merge and no weakening checks. Confirm existing #90/#91 disposition.
- [ ] Complete device, HTTPS and authenticated isolated business acceptance above.
- [ ] Obtain read-only evidence of actual VPS release SHA/digest, OS/CPU/Node,
  packaging, service manager, proxy, current cron and rollback artifact. Do not
  assume historical container files describe current production.
- [ ] Compare actual production source/config with reviewed code; preserve current
  env/secrets and sessions. Confirm all release hooks avoid migration/bootstrap.
- [ ] Build once for the actual production target; retain one buildId/artifact
  across replicas, public assets and required platform-matching dependencies.
- [ ] Keep previous working artifact, old hashed assets, config recovery record
  and established recoverable backups. No PWA schema operation is required.
- [ ] Reconfirm automatic hosting/webhook behavior and approve a specific release
  window and rollback owner separately; only then authorize the actual switch.
- [ ] After an authorized release, check proxy headers, install/update behavior,
  sessions, booking/OFP errors, ACARS/PIREP delivery and 5xx/static errors.

## Rollback — rehearse before release, execute only if authorized

1. Stop rollout and restore the previous app artifact/upstream using the verified
   service procedure. Preserve current database, production env and session keys;
   do not restore a stale DB snapshot for this schema-free release.
2. Keep old hashed assets available. Verify login, bookings, SimBrief/OFP,
   STRATOS/ACARS and the public build marker before resuming traffic.
3. A server rollback cannot remove installed workers. Keep `/sw.js` valid and serve
   a tested forward-compatible worker with a new version, or a separately reviewed
   retirement worker that unregisters itself and deletes only this app's caches.
   Neither retirement worker nor its deployment is included here.
4. Never clear all browser data/cookies or send broad Clear-Site-Data. Check older
   installed windows, explicit reload, close/reopen and offline/reconnect recovery.

**Outstanding release blockers:** physical Windows/Android acceptance, trusted HTTPS
proxy acceptance, authenticated business integration acceptance, actual Linux/VPS
artifact mapping and rollback rehearsal, final security review and latest CI.
Recommended next action: review the Draft PR and run the USB/local device checklist;
keep production at NO-GO until evidence closes these gates and release is authorized.
