# Native Pilot Booking

TASK 5.5 moves Pilot Portal flight selection and booking to HispaFly-native `Flight` records. No booking path calls vAMSYS.

## Boundaries

- `Flight` is the authoritative executable occurrence.
- `FlightOffer` is optional presentation/commercial metadata and cannot replace a Flight.
- `PilotBooking` records the pilot's claim on one internal Flight and optionally one Fleet/Aircraft.
- vAMSYS identifiers remain read-only legacy references.

## Lifecycle

New bookings enter `CONFIRMED`. TASK 5.6 may advance them through `DISPATCH_PENDING`, `DISPATCHED`, and later operational states. Pilots can cancel only pending/confirmed pre-dispatch bookings. Expiry marks overdue, non-dispatched bookings `EXPIRED` without deleting history.

## Eligibility and availability

The booking service checks active Pilot and AuthUser status, verified email, overlapping bookings, active dispatches, booking windows, Flight state, Fleet compatibility, Aircraft operational/maintenance state, location, and overlapping reservations. Missing type-rating data is reported as a warning rather than fabricated.

## Concurrency and idempotency

Creation runs in a serializable database transaction and takes a transaction-scoped advisory lock for the Flight. A unique idempotency key and the existing Pilot/Flight unique constraint return an existing Booking for duplicate submissions. Final state and resource checks are repeated inside the transaction.

## Aircraft modes

- Fixed Aircraft: Flight assignment is mandatory and cannot be changed by the Pilot.
- Pilot selection: only locally available, compatible Aircraft are displayed and rechecked.
- Fleet-only: Aircraft remains pending for TASK 5.6 Dispatch.

## Native and legacy

Legacy bookings stay visible with `VAMSYS_LEGACY`, cannot be changed, and never create Native reservations or Dispatch records. The migration does not guess Flight relationships for unresolved history.

## Permissions

Pilot access is always scoped by the authenticated Pilot ID. Staff access uses `BOOKING_VIEW`, `BOOKING_CREATE_FOR_PILOT`, `BOOKING_EDIT`, `BOOKING_ASSIGN_AIRCRAFT`, `BOOKING_CANCEL`, and `BOOKING_RESOLVE_CONFLICT`.

## Deployment and rollback

Apply migration `20260716190000_native_pilot_booking`. It only adds enum values, nullable relationships/metadata, indexes, and safe legacy-reference backfill. Rollback should disable new Booking entry points first; historical rows must not be deleted.

## TASK 5.6 contract

Dispatch consumes only `CONFIRMED` Native bookings with an internal `flightId`. It must recheck Pilot, Flight, Fleet, and Aircraft state before changing the booking to `DISPATCH_PENDING`.
