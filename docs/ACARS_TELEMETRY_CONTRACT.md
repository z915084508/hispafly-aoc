# ACARS Telemetry Contract 1.0

TASK 6.3 accepts authenticated telemetry only for a Native Dispatch belonging to the current pilot.

- `POST /api/acars/sessions` validates Dispatch, version, Booking, Flight and Aircraft identity.
- `POST /api/acars/sessions/{sessionId}/telemetry` accepts up to 500 positions and 500 events per batch.
- `(sessionId, sequenceNumber)` is unique for positions and events, making retries idempotent.
- Empty batches update the heartbeat.
- A completed batch closes the ACARS session but does not create a PIREP, payroll record or reward.

Starting the session transitions Dispatch to `DISPATCHED`, Booking and Flight to `IN_PROGRESS`, and Aircraft to `IN_FLIGHT`. Final operational completion belongs to the Native PIREP workflow in TASK 7.
