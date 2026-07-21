# ACARS Telemetry Contract 1.0

TASK 6.3 accepts authenticated telemetry only for a Native Dispatch belonging to the current pilot.

- `POST /api/acars/sessions` validates Dispatch, version, Booking, Flight and Aircraft identity.
- `POST /api/acars/sessions/{sessionId}/telemetry` accepts up to 500 positions and 500 events per batch.
- `(sessionId, sequenceNumber)` is unique for positions and events, making retries idempotent.
- Empty batches update the heartbeat.
- A completed batch atomically creates one Native PIREP for the ACARS session, completes the Dispatch, Booking and Flight, makes the Aircraft available at the arrival airport, updates aircraft utilization and moves the pilot to the arrival airport.
- Completion is idempotent: retrying an empty completed batch returns the existing Native PIREP.
- Native PIREPs do not require a VAMSYS identifier. Historical VAMSYS PIREPs keep their original identifier.

Starting the session transitions Dispatch to `DISPATCHED`, Booking and Flight to `IN_PROGRESS`, and Aircraft to `IN_FLIGHT`. Payroll, reward, company-expense and maintenance calculations remain downstream post-acceptance workflows and are not performed inside telemetry ingestion.
