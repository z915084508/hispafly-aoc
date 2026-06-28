# HISPAFLY AOC Portal

Staff portal for HISPAFLY operations, pilot administration, accepted PIREP synchronization, virtual payroll, wallet transactions, monthly reports and rankings.

This is **not an EFB**. PEGASUS ACARS and vAMSYS remain the official flight-detection and PIREP source. The AOC portal only reads accepted PIREPs and calculates virtual payroll.

## Stack

- Next.js App Router, TypeScript and Tailwind CSS
- Prisma ORM
- PostgreSQL

## Run locally

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Install dependencies with `npm install` or `pnpm install`.
3. Generate the Prisma client with `npm run prisma:generate`.
4. Create/update the development database with `npx prisma migrate dev --name task-3-mock-payroll`.
5. Load the deterministic mock workflow with `npm run prisma:seed`.
6. Start the portal with `npm run dev`.

Without `DATABASE_URL`, the dashboard, PIREP and payroll pages automatically display the same mock dataset in read-only demonstration mode. Database-backed payroll actions require PostgreSQL and the seed.

## Task 3 mock workflow

The seed creates five pilots, twelve accepted PIREPs, two rejected PIREPs, twelve one-to-one payroll records, an initial payroll rule and a mock AOC staff user. Re-running it is safe: vAMSYS pilot/PIREP IDs and the unique payroll-to-PIREP relation prevent duplicates.

Payroll actions are transactional:

- Approve: moves a pending record to approved and writes an audit log.
- Reject: rejects a pending or approved record and writes an audit log.
- Mark as paid: atomically creates one wallet transaction, increments the pilot balance and writes an audit log.

No real vAMSYS API or authentication flow is implemented yet.

## Project map

- `src/app` 鈥?portal routes, payroll server actions and page composition
- `src/components` 鈥?reusable shell and data-display components
- `src/lib/payroll` 鈥?motor de n贸mina tipado, reglas configurables y casos de prueba
- `src/lib/mock-workflow-data.ts` 鈥?deterministic Task 3 fixture data
- `src/lib/workflow-data.ts` 鈥?PostgreSQL reads with mock fallback
- `prisma/schema.prisma` 鈥?PostgreSQL domain model and constraints
- `prisma/seed.ts` 鈥?idempotent mock seed
- `docs` 鈥?product boundary and payroll rules
