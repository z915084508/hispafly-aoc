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

## v0.1 scope

Dashboard, pilot directory, read-only PIREP list, payroll workspace, wallet transaction ledger and settings. The first version uses mock data and includes no live vAMSYS integration.

## Core workflow

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

Real API calls, authentication, live notifications, PIREP editing or acceptance, ACARS processing, EFB functions, real-money payments and production reporting exports.
