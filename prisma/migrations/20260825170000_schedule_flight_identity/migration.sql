ALTER TABLE "FlightSchedule" ADD COLUMN "flightNumber" TEXT;
ALTER TABLE "FlightSchedule" ADD COLUMN "callsign" TEXT;

CREATE INDEX "FlightSchedule_flightNumber_idx" ON "FlightSchedule"("flightNumber");
CREATE INDEX "FlightSchedule_callsign_idx" ON "FlightSchedule"("callsign");

-- Existing schedules inherit their legacy Route identity. New Route rows no
-- longer receive an operational flight number or callsign.
UPDATE "FlightSchedule" AS schedule
SET "flightNumber" = route."flightNumber",
    "callsign" = route."callsign"
FROM "Route" AS route
WHERE schedule."routeId" = route."id"
  AND schedule."flightNumber" IS NULL;
