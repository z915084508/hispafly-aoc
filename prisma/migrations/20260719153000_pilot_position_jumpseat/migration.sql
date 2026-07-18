ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'jumpseat';

ALTER TABLE "Pilot"
  ADD COLUMN "currentAirportId" TEXT,
  ADD COLUMN "positionUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "positionSource" TEXT;

CREATE INDEX "Pilot_currentAirportId_idx" ON "Pilot"("currentAirportId");
ALTER TABLE "Pilot" ADD CONSTRAINT "Pilot_currentAirportId_fkey"
  FOREIGN KEY ("currentAirportId") REFERENCES "Airport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve operational continuity: initialize each pilot at the arrival airport of
-- their most recent accepted PIREP, falling back to the configured base ICAO.
WITH latest_arrival AS (
  SELECT DISTINCT ON (p."pilotId") p."pilotId", a."id" AS "airportId", COALESCE(p."acceptedAt", p."flownAt", p."createdAt") AS "positionAt"
  FROM "Pirep" p
  JOIN "Airport" a ON upper(a."icao") = upper(p."arrival")
  WHERE p."status" = 'accepted'
  ORDER BY p."pilotId", COALESCE(p."acceptedAt", p."flownAt", p."createdAt") DESC
)
UPDATE "Pilot" pilot
SET "currentAirportId" = latest."airportId", "positionUpdatedAt" = latest."positionAt", "positionSource" = 'ACCEPTED_PIREP'
FROM latest_arrival latest
WHERE pilot."id" = latest."pilotId";

UPDATE "Pilot" pilot
SET "currentAirportId" = airport."id", "positionUpdatedAt" = CURRENT_TIMESTAMP, "positionSource" = 'BASE_FALLBACK'
FROM "Airport" airport
WHERE pilot."currentAirportId" IS NULL AND upper(airport."icao") = upper(pilot."base");

CREATE TABLE "PilotJumpseat" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "departureAirportId" TEXT NOT NULL,
  "arrivalAirportId" TEXT NOT NULL,
  "distanceKm" INTEGER NOT NULL,
  "costCents" INTEGER NOT NULL,
  "walletTransactionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotJumpseat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PilotJumpseat_walletTransactionId_key" ON "PilotJumpseat"("walletTransactionId");
CREATE INDEX "PilotJumpseat_pilotId_createdAt_idx" ON "PilotJumpseat"("pilotId", "createdAt");
ALTER TABLE "PilotJumpseat" ADD CONSTRAINT "PilotJumpseat_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotJumpseat" ADD CONSTRAINT "PilotJumpseat_departureAirportId_fkey" FOREIGN KEY ("departureAirportId") REFERENCES "Airport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotJumpseat" ADD CONSTRAINT "PilotJumpseat_arrivalAirportId_fkey" FOREIGN KEY ("arrivalAirportId") REFERENCES "Airport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotJumpseat" ADD CONSTRAINT "PilotJumpseat_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
