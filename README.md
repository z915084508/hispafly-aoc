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
4. Create/update the development database with `npx prisma migrate dev`.
5. Load the deterministic mock workflow with `npm run prisma:seed`.
6. Start the portal with `npm run dev`.

Without `DATABASE_URL`, the dashboard, PIREP and payroll pages automatically display the same mock dataset in read-only demonstration mode. Database-backed payroll actions require PostgreSQL and the seed.

## Task 3 mock workflow

The seed creates five pilots, twelve accepted PIREPs, two rejected PIREPs, twelve one-to-one payroll records, an initial payroll rule and a mock AOC staff user. Re-running it is safe: vAMSYS pilot/PIREP IDs and the unique payroll-to-PIREP relation prevent duplicates.

Payroll actions are transactional:

- Approve: moves a pending record to approved and writes an audit log.
- Reject: rejects a pending or approved record and writes an audit log.
- Mark as paid: atomically creates one wallet transaction, increments the pilot balance and writes an audit log.

Real PIREP synchronization is not implemented. Task 6 only connects an individual pilot identity through vAMSYS OAuth.

## vAMSYS Pilot OAuth

Register an OAuth client in vAMSYS without a client secret and configure an exact callback URI:

- Local: `http://localhost:3000/api/vamsys/oauth/callback`
- Production: `https://YOUR-AOC-DOMAIN/api/vamsys/oauth/callback`
- Privacy policy: `https://YOUR-AOC-DOMAIN/privacy`

The URI registered in vAMSYS must exactly match `VAMSYS_PILOT_REDIRECT_URI`. Configure these server-side variables:

```env
VAMSYS_PILOT_CLIENT_ID="your-client-id"
VAMSYS_PILOT_REDIRECT_URI="http://localhost:3000/api/vamsys/oauth/callback"
VAMSYS_PILOT_SCOPES="identity:basic pilot:read flights:read"
VAMSYS_API_BASE_URL="https://vamsys.io/api/v3/pilot"
VAMSYS_AUTH_URL="https://vamsys.io/oauth/authorize"
VAMSYS_TOKEN_URL="https://vamsys.io/oauth/token"
```

Test locally by starting the portal, opening `/settings/vamsys`, and selecting **Conectar vAMSYS**. The server generates a PKCE verifier/challenge and CSRF state, stores the temporary values in secure HTTP-only cookies, exchanges the callback code on the server, reads `/user` and `/profile`, and imports the pilot profile. Access and refresh tokens are persisted only in PostgreSQL and are never returned to browser code.

`getValidVamsysAccessToken(pilotId)` refreshes expiring tokens server-side. Invalid refresh grants revoke the local connection and create audit events. This OAuth connection does not synchronize PIREPs; that remains Task 7.

Apply committed database migrations with `prisma migrate deploy` before enabling the OAuth client in a deployed environment.

## Development staff and permissions

Set `MOCK_STAFF_EMAIL` in `.env` and restart the development server to select the current staff identity:

| Email | Role | Payroll permissions |
| --- | --- | --- |
| `admin@hispafly.local` | ADMIN | Approve, reject, recalculate and pay |
| `ops@hispafly.local` | OPS | Approve, reject and recalculate |
| `finance@hispafly.local` | FINANCE | Mark approved payroll as paid |
| `viewer@hispafly.local` | VIEWER | Read only |

The selector is a development authentication adapter, not production authentication. Every payroll mutation repeats the role and active-user check on the server. Hiding a button in the browser never grants or removes permission.

The enforced workflow is `pending → approved → paid` or `pending → rejected`. Approved, rejected and paid records cannot be recalculated or rejected. Paying creates exactly one wallet transaction and immutable audit entries in the same transaction.

Use `/audit` to review staff actions, denied permission attempts and wallet transaction creation.

## Project map

- `src/app` — portal routes, payroll server actions and page composition
- `src/components` — reusable shell and data-display components
- `src/lib/payroll` — motor de nómina tipado, reglas configurables y casos de prueba
- `src/lib/staff` — development staff adapter and centralized role permissions
- `src/lib/vamsys` — PKCE, Pilot API client, profile mapping and token refresh
- `src/lib/mock-workflow-data.ts` — deterministic Task 3 fixture data
- `src/lib/workflow-data.ts` — PostgreSQL reads with mock fallback
- `prisma/schema.prisma` — PostgreSQL domain model and constraints
- `prisma/seed.ts` — idempotent mock seed
- `docs` — product boundary and payroll rules
