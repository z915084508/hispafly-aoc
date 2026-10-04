# Self-hosted AOC container (draft)

This container preserves the current Next.js server runtime and Prisma client. It builds using Node 24 and the existing pnpm lockfile. It keeps the full installed dependency tree initially to avoid premature changes to Prisma tracing and runtime packaging.

## Build and deployment boundaries

Build the image on a separate Linux builder. Do not build it on the shared V1 Travel host. No production credentials are required or accepted as build arguments. The dummy build database address is intentionally unreachable; if a page requires live data during prerendering, fix that page's rendering before proceeding rather than giving the build production database access.

The build directly runs prisma generate and next build. It never runs package.json db:deploy, staff:bootstrap, or the Vercel build wrapper. Container startup only runs next start. Database migrations are a separate controlled deployment step, after checking restored Prisma history and application compatibility.

Runtime configuration must be supplied from /opt/apps/hispafly/secrets on the server. Never commit env files or bake credentials into the image. For rehearsal, use hispafly_aoc_rehearsal; do not point the app at Neon or the V1 database. Bind any published port to loopback, use only the HISPAFLY AOC database network, and apply container memory/CPU limits.

## Validation still required

- This draft has not been built or executed in Docker: the current workstation has no Docker CLI.
- Build and test on a separate builder before using this image.
- Validate native pilot and Staff logins against restored credentials; do not enable Staff bootstrap or reset passwords just to make rehearsal work.
- Check file uploads/downloads, Prisma access, ACARS/EFB routes and the AOC-AMN integration.
- Supply missing business credentials only when their purpose and consumers have been verified.
- Vercel Blob, Neon Auth and the GOC credential handover remain separate migration work.
- Rehearsal snapshots are not continuously synchronized. A final backup/write handover plan is required before production cutover.
