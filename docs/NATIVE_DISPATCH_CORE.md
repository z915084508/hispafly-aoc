# Native Dispatch Core

TASK 5.6 turns a confirmed Native Booking into the only operational release that future ACARS may consume. vAMSYS identifiers are never required.

## Boundaries

Booking reserves the Pilot and planned Flight. Dispatch finalizes Aircraft and operational decisions. OFP is a planning artifact attached to Dispatch. DispatchRelease is structured signature evidence bound to one Dispatch version and snapshot checksum.

## Lifecycle and versions

Native Dispatch uses DRAFT, PREPARING, CHECK_REQUIRED, READY_FOR_RELEASE, RELEASED, SUPERSEDED, VOIDED, CANCELLED and EXPIRED. Only the current RELEASED version is returned by the ACARS assignment contract. Released snapshots are immutable. The schema stores version and supersession identity so a later reissue workflow can create a replacement without mutating release evidence; this first release does not expose reissue controls.

## Snapshot and checks

Snapshots preserve Flight, Route, Aircraft, load, OFP and fuel-policy inputs. Checks use PASS, WARNING, BLOCK, NOT_REQUIRED and UNKNOWN. Safety-critical UNKNOWN and every BLOCK prevent release. Warnings require explicit acknowledgement.

## Release consistency

Release uses a serializable transaction and advisory lock. It re-reads current identities, binds structured release evidence to the snapshot checksum, and changes Dispatch, Booking, Flight and Aircraft together. Repeated release is idempotent.

## Cancel, void and expiry

Pre-release Dispatch may be cancelled. Released, not-started Dispatch requires a separately authorized void. Expiry is idempotent and releases the Aircraft. Active/flown operations are excluded from these flows.

## ACARS contract

`GET /api/acars/assignment` returns only the authenticated Pilot's current Native RELEASED Dispatch with Native dispatch, booking, flight, pilot, fleet and aircraft identities. It does not implement telemetry or PIREP submission.

## Legacy

Legacy Dispatch/OFP/PIREP data remains readable and is never automatically converted or sent to vAMSYS.

## Permissions

Staff uses DISPATCH_VIEW, DISPATCH_CREATE, DISPATCH_EDIT, DISPATCH_ASSIGN_AIRCRAFT, DISPATCH_RUN_CHECKS, DISPATCH_RELEASE, DISPATCH_VOID and DISPATCH_VIEW_AUDIT. Pilot operations remain identity-scoped.

## Migration

Apply `20260716210000_native_dispatch_core`. The migration adds lifecycle values, snapshot/version/release evidence and indexes without deleting historical records. Disable Native Dispatch entry points before rollback; never delete released snapshots.
