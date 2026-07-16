# Native Flight Identity Foundation

## Purpose

TASK 5.1 establishes HispaFly-owned identifiers and relationships for flight
operations. All primary identities are Prisma `id` values generated inside the
AOC. A vAMSYS identifier is an optional legacy reference only; Native services
do not call vAMSYS, read OAuth tokens, or consume synchronization payloads as
domain models.

## Entity responsibilities

- **Airport** identifies a physical airport. ICAO is normalized to uppercase and
  unique. `legacyVamsysId` is optional.
- **Route** is a long-lived commercial route template. It links departure and
  arrival through `departureAirportId` and `arrivalAirportId`, while retaining
  legacy ICAO text columns for old pages.
- **FlightSchedule** defines recurring operating intent for a Route during an
  effective period. It does not represent a flown sector.
- **Flight** is one dated, timed operating instance. It always links to a Route,
  may link to a Schedule, and may have an assigned Aircraft.
- **Fleet** identifies an aircraft category using its internal `id`.
- **Aircraft** identifies an airframe. Its normalized registration is unique,
  and `nativeFleetId`/`currentAirportId` are internal relations.
- **FlightOffer** remains the publication/invitation layer. It is not a Route,
  Schedule, or Flight. Internal relations have been added without rewriting the
  frozen legacy workflow.
- **PilotBooking** reserves one Pilot against one Flight. The unique
  `(pilotId, flightId)` constraint prevents duplicate Native bookings.
- **FlightDispatch** is the operational dispatch lifecycle and can link Booking,
  Flight, Route, Aircraft and OFP. `acarsSessionId` is reserved as a future
  hand-off point; no ACARS API exists in TASK 5.1.
- **PIREP** remains the historical legacy report model in this task. Native PIREP
  is intentionally deferred.

## Internal ID rules

1. Relationships use local `id` fields and database foreign keys.
2. ICAO, registration, flight number, callsign, email, or external IDs are never
   entity primary keys.
3. New records default to `HISPAFLY_NATIVE`.
4. Controlled file imports use `IMPORTED`; explicit staff-created records may
   use `MANUAL`.
5. Existing vAMSYS-linked records remain `VAMSYS_LEGACY`.

## Native versus Legacy

Legacy fields are retained, nullable where Native creation requires it, and
never fabricated. The migration only backfills relationships when an exact,
unique external-ID or ICAO match already exists. It does not match by person
name, aircraft label, route name, or approximate flight number.

Existing pages may continue to read the legacy columns. New code must enter
through `src/lib/native-flight` and use internal IDs.

## Boundaries

```text
Route (template)
  -> FlightSchedule (recurrence/effective period)
    -> Flight (dated instance)
      -> FlightOffer (optional publication)
      -> PilotBooking (pilot reservation)
        -> FlightDispatch (operational lifecycle)
          -> OFP / future ACARS session
```

An Aircraft can be assigned to a Flight or Booking. Booking creation performs a
serializable overlap check for an Aircraft. Database uniqueness prevents the
same Pilot booking the same Flight twice.

## Migration strategy

The migration is additive:

- no table, PIREP, wallet, payroll, maintenance, audit or external ID is deleted;
- new relation columns are nullable for legacy coexistence;
- `vamsysAircraftId` and `vamsysBookingId` become optional;
- exact matches backfill Airport, Fleet, Aircraft, Route, Offer, Booking,
  Dispatch and location relations;
- uncertain records remain unlinked for future manual review;
- the migration performs no external request and is repeatable through Prisma's
  migration ledger.

Before migration design, production was checked read-only: no duplicate ICAO or
aircraft registration groups existed; the inspected data contained 1 Route, 15
Fleets, 34 Aircraft, 7 Bookings and 42 Dispatches.

## Native service boundary

`src/lib/native-flight` provides Airport, Route, Fleet, Aircraft, Flight,
Booking and Dispatch lookups/creation boundaries. These services validate
internal relations and normalization without importing `src/lib/vamsys`.

## Follow-up contract

- TASK 5.2: Airport and Route management UI/services.
- TASK 5.3: Native Fleet and Aircraft management and location migration.
- TASK 5.4: Schedule authoring and Flight generation.
- TASK 5.5: Native Pilot Booking workflow and UI.
- TASK 5.6: Dispatch lifecycle without the legacy FlightOffer dependency.
- TASK 5.7: reviewed/manual legacy relationship reconciliation.
- TASK 6: ACARS uses `flightId`, `bookingId`, `dispatchId`, `pilotId` and
  `aircraftId`.
- TASK 7: Native PIREP references `flightId`, `dispatchId`, `pilotId` and
  `aircraftId`.

## Explicitly out of scope

No ACARS endpoint, tracking, live map, Native PIREP, bulk flight generation,
booking-page rewrite, payroll/wallet redesign, or vAMSYS access is implemented
here.
