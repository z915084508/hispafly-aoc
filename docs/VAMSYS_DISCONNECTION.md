# vAMSYS Disconnection and Legacy Data Policy

## Decision

HispaFly lost operational and API access to vAMSYS and froze the integration on
2026-07-16. vAMSYS is no longer an available operational system. The HispaFly
AOC is the primary business system and must start, authenticate users, and serve
local features without any vAMSYS token or network availability.

This freeze is fail-closed. The application does not probe undocumented
endpoints, bypass permissions, refresh tokens, or automatically reconnect.

## Dependency inventory

| Dependency | Location / function | Disposition |
| --- | --- | --- |
| Pilot API client and token exchange | `src/lib/vamsys/client.ts` | `DISABLE_NOW` |
| Pilot OAuth/token storage | `VamsysOAuthToken`, legacy settings | `HISTORICAL_READ_ONLY` |
| OAuth start/callback UI | removed route / legacy settings UI | `DISABLE_NOW` |
| Operations API client | `src/lib/vamsys/operations.ts` | `DISABLE_NOW` |
| Accepted PIREP synchronization | `operationsPireps.ts`, cron route | `DISABLE_NOW` |
| Pilot synchronization | `pilotSync.ts`, cron route | `DISABLE_NOW` |
| Fleet and Aircraft synchronization | `fleetSync.ts`, fleet/aircraft services | `REPLACE_IN_TASK_5` |
| Route synchronization/publication | `routes/service.ts` | `REPLACE_IN_TASK_5` |
| Booking and Self Dispatch | Pilot bookings/flight-offer services | `REPLACE_IN_TASK_5` |
| PIREP webhook processing | `/api/webhooks/vamsys/pireps` | `DISABLE_NOW` |
| Pilot token refresh | `src/lib/vamsys/token.ts` | `DISABLE_NOW` |
| Staff sync/create/update/delete controls | Fleet/Aircraft/Route/PIREP pages | `DISABLE_NOW` |
| Pilot legacy data reads | Dashboard, PIREPs, wallet, payroll | `HISTORICAL_READ_ONLY` |
| EFB booking/dispatch references | EFB/OFP booking chain | `REPLACE_IN_TASK_5` |
| Vercel scheduled tasks | `vercel.json` | `DISABLE_NOW` |
| vAMSYS database fields and raw payloads | Prisma models | `HISTORICAL_READ_ONLY` |
| Legacy integration implementation | `src/lib/vamsys/**` | `REMOVE_LATER` |

## Frozen functions

- No creation, modification, deletion, archival, booking, dispatch, or
  synchronization request is sent to vAMSYS.
- Operations and Pilot API network boundaries throw a controlled
  `VamsysDisconnectedError` before fetching.
- PIREP and Pilot Vercel cron schedules are removed.
- Cron endpoints remain inert for safe rollback/deployment overlap and return a
  disabled result without importing or running sync code.
- The webhook acknowledges receipt as disabled and does not process the body.
- Token refresh is stopped before reading or updating a stored OAuth token.
- Staff integration status is read-only and explicitly states that automatic
  reconnection is disabled.

## Features that remain available

- HispaFly local Pilot registration, email verification, login and sessions.
- Staff login, authorization, audit and RRHH.
- Historical accepted PIREP browsing.
- Wallet, payroll, expenses and statistics based on stored local records.
- Local Fleet, Aircraft, Airport and Route reads.
- Local maintenance, economy and fuel reference operations that do not call
  vAMSYS.

Pages must handle missing local data as an empty state. External integration
errors must not become raw `Failed to fetch` messages, infinite loading, or a
dashboard-wide failure.

## Historical data protection

The following are retained and must not be cleared:

- `vamsysPilotId`, `vamsysPirepId`, `vamsysBookingId`, `vamsysRouteId`,
  `vamsysFleetId`, `vamsysAircraftId`;
- raw synchronization payloads and timestamps;
- accepted historical PIREPs;
- payroll, wallet, company expense, maintenance and audit records;
- encrypted historical OAuth records until their audit-retention period ends.

These values are migration references and evidence, not the primary key for new
business records.

The `AocDataOrigin` values are:

- `HISPAFLY_NATIVE` — default for new AOC records;
- `VAMSYS_LEGACY` — records linked to the discontinued system;
- `IMPORTED` — records imported from a controlled non-live source;
- `MANUAL` — records explicitly maintained by authorized staff.

The TASK 4.7 migration marks existing entities carrying vAMSYS IDs as
`VAMSYS_LEGACY` without deleting or rewriting their original fields.

## Environment variable audit

The following variables are deprecated but must remain in production until the
TASK 5 replacement is accepted and secret removal is separately approved:

- `VAMSYS_PILOT_CLIENT_ID`
- `VAMSYS_PILOT_REDIRECT_URI`
- `VAMSYS_PILOT_SCOPES`
- `VAMSYS_API_BASE_URL`
- `VAMSYS_AUTH_URL`
- `VAMSYS_TOKEN_URL`
- `VAMSYS_OPERATIONS_CLIENT_ID`
- `VAMSYS_OPERATIONS_CLIENT_SECRET`
- `VAMSYS_OPERATIONS_API_BASE_URL`
- `VAMSYS_OPERATIONS_TOKEN_URL`
- `VAMSYS_OPERATIONS_SCOPES`
- optional Operations path overrides beginning with `VAMSYS_OPERATIONS_`
- `VAMSYS_TOKEN_ENCRYPTION_KEY`
- `VAMSYS_WEBHOOK_SECRET`

They are not a signal to enable the integration. Do not delete production
secrets during TASK 4.7; retain them for controlled rollback and historical
decryption only.

## TASK 5 replacement boundary

TASK 5 must introduce HispaFly-native internal IDs and repositories for:

1. Flight definitions and routes.
2. Aircraft and fleet availability.
3. Flight assignment and booking.
4. Dispatch and flight-session lifecycle.
5. Native PIREP submission and acceptance.
6. ACARS/event ingestion in a later explicitly approved scope.

Adapters may import legacy data, but domain services must not depend on vAMSYS
field names, statuses, token availability, or external IDs.

## Final deletion conditions

The legacy code and secrets may only be removed after all of the following:

- TASK 5 native workflows are deployed and accepted;
- every retained legacy entity has a stable internal identity;
- historical page, wallet, payroll and audit reconciliation is complete;
- rollback exports and database backups have been verified;
- production has operated without vAMSYS code paths for an agreed retention
  period;
- an owner explicitly approves secret and legacy-code removal.

## Rollback and emergency procedure

TASK 4.7 rollback means restoring the previous AOC release, not attempting to
reconnect to vAMSYS. Before rollback, take a database snapshot and preserve the
`AocDataOrigin` migration. If a local feature fails, disable only that local
feature, keep external network guards active, and investigate using local audit
logs. Re-enabling any vAMSYS request requires a separate security and ownership
decision; it is outside this task.

## Verification checklist

- Build succeeds with vAMSYS credentials absent.
- Pilot and Staff login use HispaFly identity only.
- Dashboard and RRHH load from local data.
- Historical PIREPs remain readable.
- Cron configuration contains no vAMSYS schedules.
- Cron and webhook endpoints do not invoke synchronization.
- No vAMSYS token refresh or production fetch can run.
- No migration deletes a historical row or external ID.
- Staff can see Disconnected / Legacy status, last successful sync, disabled
  jobs, and legacy/native record counts.
