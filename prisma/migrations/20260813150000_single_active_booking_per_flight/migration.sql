-- Enforce the PROGRAMACION invariant at the database boundary. Historical and
-- cancelled rows remain available while only one active reservation may exist.
CREATE UNIQUE INDEX "PilotBooking_one_active_reservation_per_flight"
ON "PilotBooking" ("flightId")
WHERE "flightId" IS NOT NULL
  AND "status" IN ('PENDING', 'CONFIRMED', 'BOOKED', 'DISPATCH_PENDING', 'DISPATCHED', 'IN_PROGRESS');
