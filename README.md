# HISPAFLY AOC Portal

Initial staff portal for HISPAFLY airline operations control. It covers pilot administration, accepted PIREP synchronization, virtual payroll, wallet transactions and reporting-oriented dashboard views.

This is **not an EFB**. PEGASUS ACARS and vAMSYS remain the official flight detection and PIREP source. The AOC portal only reads accepted PIREPs and derives virtual payroll records.

## Stack

- Next.js App Router, TypeScript and Tailwind CSS
- Prisma ORM
- PostgreSQL

## Run locally

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Install dependencies with `pnpm install`.
3. Generate the Prisma client with `pnpm prisma:generate`.
4. Start the preview with `pnpm dev`.

All visible data is currently provided by `src/lib/mock-data.ts`. No real vAMSYS calls or authentication flows are implemented in v0.1.

## Project map

- `src/app` — portal routes and page composition
- `src/components` — reusable shell and data-display components
- `src/lib` — mock domain data
- `prisma/schema.prisma` — proposed PostgreSQL domain model
- `docs` — product boundary and payroll rules

## Next milestones

Authentication and staff roles, read-only vAMSYS synchronization, idempotent payroll calculation, wallet audit controls, report export, tests and deployment configuration.
