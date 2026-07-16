# Native schedules and flight generation

TASK 5.4 makes HispaFly schedules and concrete flights database-native. No schedule or flight generation path calls vAMSYS.

## Boundaries

- A `Route` is the reusable airport-to-airport definition.
- A `FlightSchedule` is a recurring rule using an operating weekday and departure-airport local time.
- A `Flight` is an immutable operational occurrence for one local operating date.
- A `FlightOffer` is a commercial/crew availability record and should reference `Flight.flightId` for new native offers.

## Time handling

Schedules store IANA time-zone names and local minutes after midnight. Generation resolves each operating date independently, so seasonal UTC offsets and cross-midnight arrivals are preserved. Nonexistent or repeated local times at DST transitions are returned as structured generation errors and are not guessed.

## Idempotency and safety

Generated flights use a stable SHA-256 key derived from `scheduleId + operatingDate`. Re-running a manual or cron range skips existing occurrences. Schedule changes do not silently rewrite generated flights. Completed flights cannot be cancelled by the native cancellation service.

## Automation

`GET /api/cron/native-flight-generation` uses the existing cron secret and creates a rolling 30-day window from active schedules. It reads and writes only the HispaFly database.

## Deployment

Apply migration `20260716170000_native_schedule_flight_generation` before enabling schedule management. Keep existing legacy schedule/flight columns and statuses until consumers have moved to the new snapshot fields.
