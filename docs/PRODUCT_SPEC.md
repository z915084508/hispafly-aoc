# HISPAFLY AOC Portal — Product Specification

## Purpose

Provide HISPAFLY AOC staff with a single operational workspace for pilot administration, accepted PIREP visibility, virtual payroll calculation, wallet auditing and management reporting.

## Explicit boundary

HISPAFLY AOC is separate from the existing EFB. It does not detect flights, replace PEGASUS ACARS, submit or accept PIREPs, or become a pilot flight-deck tool. PEGASUS ACARS and vAMSYS remain authoritative. Only accepted vAMSYS PIREPs are eligible for ingestion.

## Initial users

- Operations staff: monitor accepted activity and synchronization health.
- Payroll staff: review calculation results and close payroll periods.
- Administrators: manage pilot records, rules and controlled adjustments.
- Management: consume summary reporting.

## v0.1 scope

Dashboard, pilot directory, read-only PIREP list, payroll workspace, wallet transaction ledger and settings. The first version uses mock data and includes no live vAMSYS integration.

## Core workflow

1. A future synchronization worker reads accepted PIREPs from vAMSYS.
2. Each external PIREP is stored once using its immutable external identifier.
3. The active versioned payroll rule calculates a draft payroll line.
4. Staff review exceptions and close the period.
5. Closing posts immutable wallet transactions and reporting totals.

## Non-functional requirements

Role-based access, complete auditability, idempotent synchronization, UTC storage, accessible responsive UI, clear source attribution, recoverable integration failures and no silent financial recalculation.

## Out of scope for v0.1

Real API calls, authentication, live notifications, PIREP editing or acceptance, ACARS processing, EFB functions, real-money payments and production reporting exports.
