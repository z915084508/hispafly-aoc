# HISPAFLY AOC Portal - Codex Instructions

This project is the HISPAFLY AOC Portal.

## Production environment — VPS only

- The owner's current architecture is fully self-hosted on the HISPAFLY VPS.
  The VPS is the only production environment and its PostgreSQL is the production
  data source. Vercel hosting/deployments and Neon databases are retired for AOC.
- Never deploy, promote, reconnect, migrate to, or provision Vercel or Neon for this
  project. Legacy files, check statuses, URLs and historical documentation do not
  override this policy. Next.js/Prisma libraries do not imply either hosting provider.
- Do not assume Nginx, Caddy, PM2, Docker/Compose, systemd, PostgreSQL versions,
  release paths, SSH users or ports. Confirm the actual VPS components with read-only
  evidence. If access is unavailable, request the specific missing information.
- Production changes (including service reload/restart, proxy/DNS/TLS, databases,
  migrations, cron, credentials and release switching) require explicit authorization.
  PR approval or branch publication alone is not deployment authorization.
- Work on development branches and use PRs. Do not push directly to main, merge,
  enable auto-merge or change branch protection/integrations unless explicitly asked.
  Never manufacture a successful legacy Vercel status or weaken checks to merge.
- Build/test with isolated databases and test/stub integrations. Never use production
  credentials for previews, CI or local builds; do not run seed/bootstrap against
  production. Preserve existing session/signing secrets and API contracts.
- Historical Vercel/Neon cleanup is a separately reviewed plan. Do not delete legacy
  storage, integrations or data based on their names: first establish ownership,
  current dependencies and recoverability without exposing secrets.

## PWA safety and releases

- Cache only the exact public static allowlist. Never cache credentials, authenticated
  HTML, API/RSC responses, SimBrief OFPs/PDFs, bookings, TSAT/CTOT, STRATOS/ACARS PIREPs
  or other personal/operational data. Never queue offline business writes.
- Keep a stable manifest id/scope/start URL. Check for application releases as well
  as worker changes; update checks must not depend on changing the SW file alone.
  Inform users of new versions without automatically discarding unsaved forms.
- Each release must document artifact/build identity, actual VPS packaging, staging
  validation, previous artifact and server/client SW rollback. Never restore an old
  database snapshot for a schema-free PWA rollback or clear all browser storage.

HISPAFLY already has an EFB. Do not rebuild EFB features in this project.

## Main purpose

- Staff operations portal
- Pilot management
- HispaFly ACARS PIREP ingestion
- Virtual payroll calculation
- Pilot wallet system
- Monthly reports and rankings

## Data source

- HispaFly ACARS submits flights directly to HispaFly AOC.
- Native AOC PIREPs are the operational source of truth.
- Imported vAMSYS records are historical evidence only and must never trigger an external request.

## Tech stack

- Next.js
- TypeScript
- Prisma
- PostgreSQL
- Tailwind CSS

## Security rules

- Never re-enable retired vAMSYS OAuth or API requests.
- Never commit `.env` files.
- Store API tokens server-side only.
- Payroll records must not be duplicated.
- Use internal PIREP identity for new reports; retain legacy IDs only for historical uniqueness.
- Add audit logs for staff actions.

## Useful commands

These are development commands only. Database commands require an explicitly
isolated development database; they are not production deployment steps.

```bash
npm install
npm run dev
npm run lint
npx prisma migrate dev
```
