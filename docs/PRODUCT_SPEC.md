# HISPAFLY AOC Portal — Product Specification

## Purpose

Provide HISPAFLY AOC staff with a single operational workspace for pilot administration, accepted PIREP visibility, virtual payroll calculation, wallet auditing and management reporting.

## Explicit boundary

HISPAFLY AOC is separate from the existing EFB. It does not detect flights, replace PEGASUS ACARS, submit or accept PIREPs, or become a pilot flight-deck tool. PEGASUS ACARS and vAMSYS remain authoritative. Only accepted vAMSYS PIREPs are eligible for ingestion.

## AOC staff roles

- `ADMIN`: full AOC access, including payroll review and settlement.
- `OPS`: views operational data and may approve, reject or recalculate pending payroll.
- `FINANCE`: views wallets and may mark approved payroll as paid.
- `VIEWER`: read-only access with no mutations.

Inactive staff cannot perform actions regardless of role. Authorization is enforced in server actions and permission denials are audited. The current development identity comes from `MOCK_STAFF_EMAIL`; this adapter will be replaced by real staff authentication later.

## Portal separation

The Staff Portal shows company operations, passenger revenue, payroll cost, company economic movements and the audit log. Pilot wallet transactions, personal PIREPs and personal payroll belong to a separate Pilot Portal and must be filtered server-side to the authenticated pilot. The Pilot Portal must never expose the staff audit log or company-wide financial movements.

## vAMSYS Pilot OAuth connection

Each pilot must explicitly authorize HISPAFLY AOC through vAMSYS Authorization Code + PKCE. HISPAFLY does not collect the pilot's vAMSYS password and the Pilot OAuth client uses no client secret.

The callback imports identity and pilot profile fields from the vAMSYS Pilot API. Access and refresh tokens are stored server-side only, linked one-to-one with the local pilot, and never rendered or returned to frontend code. Expired access tokens are refreshed on demand. An `invalid_grant` response marks the connection revoked and requires fresh pilot consent.

OAuth started, connected, failed, refreshed and revoked events are recorded in the AOC audit log. Pilot OAuth grants identity access only; it does not accept PIREPs, detect flights or replace PEGASUS ACARS.

## v0.1 scope

Dashboard, pilot directory, read-only mock PIREP list, payroll workspace, wallet transaction ledger, staff audit log and vAMSYS Pilot OAuth connection. Live PIREP synchronization is not included.

## Accepted PIREP synchronization

ADMIN and OPS may manually import accepted PIREPs through each connected pilot's OAuth grant. The integration is read-only, follows cursor pagination and continues with other pilots when one connection fails. `vamsysPirepId` is the immutable idempotency key; raw source data and synchronization timestamps are retained for traceability.

An accepted PIREP creates at most one pending payroll record. Existing payroll is never recalculated by synchronization. Incomplete PIREPs remain visible with nullable fields and do not generate payroll until the calculation inputs are complete.

## Operations API directory

The server uses the vAMSYS Client Credentials grant to read the airline pilot directory, pilot detail and administrative notes. Credentials and access tokens remain server-side. ADMIN and OPS may run a manual sync; the portal records connection health and audit events. Notes are imported read-only. Fleet, Aircraft and Route persistence is prepared but inactive until official endpoint contracts are confirmed.

## Core workflow

### Passenger revenue

The AOC dashboard reports monthly passenger revenue using `passengers × 80 credits × distance factor`. Factors are 0.75 for 0–300 nm, 1.00 for 301–800 nm, 1.30 for 801–1500 nm, 1.80 for 1501–3000 nm, 2.40 for 3001–5000 nm and 3.00 above 5000 nm. Revenue is stored as integer credit cents per accepted PIREP.

1. A future synchronization worker reads accepted PIREPs from vAMSYS.
2. Each external PIREP is stored once using its immutable external identifier.
3. The active versioned payroll rule calculates a draft payroll line.
4. ADMIN or OPS reviews each pending record and approves or rejects it.
5. ADMIN or FINANCE marks an approved record as paid.
6. Payment atomically creates one immutable wallet transaction, updates the pilot wallet and records both events in the audit log.

Payroll transitions are strict: only pending payroll may be approved, rejected or recalculated; only approved payroll may be paid. Paid payroll cannot be changed and a unique payroll-to-wallet relation prevents duplicate settlement.

## Non-functional requirements

Role-based access, complete auditability, idempotent synchronization, UTC storage, accessible responsive UI, clear source attribution, recoverable integration failures and no silent financial recalculation.

## Out of scope for v0.1

Real PIREP synchronization, Pilot OAuth as an AOC login system, Operations API client credentials, live notifications, PIREP editing or acceptance, ACARS processing, EFB functions, real-money payments and production reporting exports.
