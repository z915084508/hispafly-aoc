DROP INDEX IF EXISTS "FlightDispatch_flightOfferId_key";

CREATE INDEX IF NOT EXISTS "FlightDispatch_flightOfferId_status_idx"
ON "FlightDispatch"("flightOfferId", "status");
