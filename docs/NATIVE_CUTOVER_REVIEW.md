# Native Cutover Review

## Purpose

TASK 5.7 verifies that Airport → Route → Fleet/Aircraft → Schedule → Flight → Booking → Dispatch → Released Assignment operates using HispaFly internal identity. vAMSYS remains a historical source only. No migration function calls, probes, refreshes or writes the external API.

## Classification

- `NATIVE_READY`: complete internal identity and `HISPAFLY_NATIVE` origin.
- `LEGACY_LINKED`: a retained Legacy record has a deterministic internal relation.
- `LEGACY_UNRESOLVED`: a required internal relation is absent.
- `LEGACY_HISTORICAL_ONLY`: preserved for history, finance, statistics or audit and excluded from new operations.
- `INVALID_REQUIRES_REVIEW`: a Native-labelled record is incomplete or conflicting.

Ambiguous records are never promoted automatically.

## Matching rules

Automatic association is limited to unique exact identifiers: normalized ICAO, fleet code, aircraft registration, or complete composite operational identity. Route requires direction plus route/flight code. Flight requires route, operating date, scheduled departure and flight number. Booking and Dispatch require all internal parent identities and no competing candidate.

Names, display names, approximate dates, nearest timestamps, aircraft type alone, route-string similarity, first-array entries and unverified payload fields are forbidden matching evidence.

## Preview and review

`/staff/native-cutover` shows measured inventory. Queue refresh records incomplete Route, Aircraft, Booking, Dispatch and Aircraft Location records. `/staff/native-cutover/review/[id]` provides a read-only preview before any decision. High-risk links are confirmed individually.

Execution uses a transaction, idempotent operation key and immutable before/after entry. Reject and Historical-only decisions preserve the source. This release records explicit reviewed association evidence; it does not merge or delete source records.

## Historical data policy

vAMSYS IDs, raw payloads, PIREPs, payroll, wallet, maintenance, audit logs, bookings, dispatches, OFPs, signatures and location history remain readable. Legacy IDs are evidence only and cannot identify new Route, Flight, Booking, Dispatch, ACARS assignment or future Native PIREP.

## Native Write Gate

Native Booking and Dispatch require:

- `HISPAFLY_NATIVE` Flight, Route, Booking and Aircraft;
- internal Flight, Route, Airport, Booking and Aircraft IDs;
- no inference from a Legacy-only reference.

`FlightOffer.vamsysRouteId` and `FlightOffer.vamsysAircraftId` are now nullable so Native Dispatch no longer fabricates external IDs.

## Runtime dependency audit

| Area | Classification | State |
| --- | --- | --- |
| Stored vAMSYS identifiers and payloads | HISTORICAL_READ | retained |
| Pilot/Staff Legacy pages | LEGACY_DISPLAY | read-only |
| Native cutover review | MIGRATION_ONLY | local database only |
| vAMSYS cron routes | DEAD_CODE / disabled facade | return disabled response |
| vAMSYS webhook | DEAD_CODE / disabled facade | acknowledges and ignores |
| Pilot API client | FORBIDDEN_RUNTIME_DEPENDENCY | network gate throws before fetch |
| Operations API/token | FORBIDDEN_RUNTIME_DEPENDENCY | network gate throws before token/fetch |
| OAuth refresh | FORBIDDEN_RUNTIME_DEPENDENCY | network gate throws |
| Native Booking/Dispatch/ACARS | Native | no external calls |

The source remains for historical maintenance until TASK 8, but every network boundary is fail-closed.

## Environment variables

All `VAMSYS_*` values are `LEGACY_DISABLED` and are not required for build, login, Native operations, EFB or ACARS Assignment. They should be revoked and removed from production after an environment backup:

- Pilot client/API/OAuth values: `UNUSED_REMOVE_NOW`
- Operations client/API/token values: `UNUSED_REMOVE_NOW`
- timeout and scope values: `UNUSED_REMOVE_NOW`
- identifiers retained inside database records: `MIGRATION_REFERENCE_ONLY`

No secret is logged or exported by the cutover tools.

## ACARS Assignment Contract 1.0

The contract contains `contractVersion`, Dispatch/Booking/Flight/Pilot internal IDs, operating identity, internal Airport/Fleet/Aircraft IDs, load, OFP reference and release timestamps. Only current `HISPAFLY_NATIVE + RELEASED` Dispatch is returned. Void, superseded, expired and Legacy Dispatch are excluded.

## EFB contract

EFB Official mode now resolves:

Native Pilot → current Native Released Dispatch → Native Flight/Booking → Native Aircraft → OFP/performance.

It no longer requires a vAMSYS booking or aircraft identity. Manual performance mode remains available.

## PIREP boundary

Historical PIREP, payroll, wallet and statistics remain readable. TASK 5.7 does not create a Native PIREP. A released Native Dispatch waits for TASK 6 runtime/session work and TASK 7 Native PIREP; a Legacy PIREP cannot become a new ACARS session identity.

## Production checklist

- Apply `20260716230000_native_cutover_review`.
- Back up the database before reviewed batch association.
- Confirm identity and Staff access.
- Confirm Native generation, booking and release.
- Confirm EFB Native active-flight response.
- Confirm ACARS Assignment contract `1.0`.
- Confirm vAMSYS cron and webhook facades stay disabled.
- Confirm deployment without `VAMSYS_*`.
- Review every invalid or unresolved high-risk item.

`READY_FOR_ACARS` is computed from real inventory and the review queue; no button can force it.

## Rollback

Application rollback may disable `/staff/native-cutover` and the new contract while retaining the additive tables. Operation entries provide reversible association evidence. Rollback restores prior relation values; it never deletes a target or clears historical data. Do not roll back released Dispatch snapshots.

## TASK 6 entry conditions

TASK 6 may begin when the dashboard has no invalid records, required operational Legacy relations are resolved or historical-only, Native end-to-end tests pass, EFB uses Native Dispatch, ACARS contract `1.0` is frozen, and the production backup/checklist is complete.
