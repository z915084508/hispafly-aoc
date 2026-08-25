-- Phase 1 keeps legacy single-fleet/aircraft columns readable so existing
-- Programacion rows continue to work while all new planning uses eligibility.
CREATE TABLE "FlightScheduleEligibleFleet" (
  "scheduleId" TEXT NOT NULL,
  "fleetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlightScheduleEligibleFleet_pkey" PRIMARY KEY ("scheduleId", "fleetId")
);

CREATE TABLE "FlightEligibleFleet" (
  "flightId" TEXT NOT NULL,
  "fleetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlightEligibleFleet_pkey" PRIMARY KEY ("flightId", "fleetId")
);

CREATE TABLE "AircraftMovement" (
  "id" TEXT NOT NULL,
  "aircraftId" TEXT NOT NULL,
  "flightId" TEXT,
  "pirepId" TEXT NOT NULL,
  "departureIcao" TEXT NOT NULL,
  "arrivalIcao" TEXT NOT NULL,
  "departedAt" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3) NOT NULL,
  "blockMinutes" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'PIREP',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AircraftMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FlightScheduleEligibleFleet_fleetId_idx" ON "FlightScheduleEligibleFleet"("fleetId");
CREATE INDEX "FlightEligibleFleet_fleetId_idx" ON "FlightEligibleFleet"("fleetId");
CREATE UNIQUE INDEX "AircraftMovement_pirepId_key" ON "AircraftMovement"("pirepId");
CREATE INDEX "AircraftMovement_aircraftId_arrivedAt_idx" ON "AircraftMovement"("aircraftId", "arrivedAt");
CREATE INDEX "AircraftMovement_departureIcao_departedAt_idx" ON "AircraftMovement"("departureIcao", "departedAt");
CREATE INDEX "AircraftMovement_arrivalIcao_arrivedAt_idx" ON "AircraftMovement"("arrivalIcao", "arrivedAt");

ALTER TABLE "FlightScheduleEligibleFleet" ADD CONSTRAINT "FlightScheduleEligibleFleet_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "FlightSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlightScheduleEligibleFleet" ADD CONSTRAINT "FlightScheduleEligibleFleet_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlightEligibleFleet" ADD CONSTRAINT "FlightEligibleFleet_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlightEligibleFleet" ADD CONSTRAINT "FlightEligibleFleet_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AircraftMovement" ADD CONSTRAINT "AircraftMovement_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AircraftMovement" ADD CONSTRAINT "AircraftMovement_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Compatibility backfill: existing Programacion/Flight rows retain their fleet.
INSERT INTO "FlightScheduleEligibleFleet" ("scheduleId", "fleetId")
SELECT "id", "defaultFleetId" FROM "FlightSchedule" WHERE "defaultFleetId" IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO "FlightEligibleFleet" ("flightId", "fleetId")
SELECT "id", "fleetId" FROM "Flight" WHERE "fleetId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Planning aircraft assignments are deliberately cleared only for future,
-- unclaimed scheduled operations. Historical/executing data remains intact.
UPDATE "FlightSchedule" SET "assignedAircraftId" = NULL;
UPDATE "Flight" SET "assignedAircraftId" = NULL
WHERE "operatingType" = 'SCHEDULED'
  AND "status" IN ('SCHEDULED', 'OPEN', 'OPEN_FOR_BOOKING');
