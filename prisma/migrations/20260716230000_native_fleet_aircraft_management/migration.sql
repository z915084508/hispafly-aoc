CREATE TYPE "FleetOperationalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "NativeAircraftStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'DISPATCHED', 'IN_FLIGHT', 'TURNAROUND', 'MAINTENANCE', 'FERRY_ONLY', 'AOG', 'SUSPENDED', 'RETIRED', 'UNKNOWN');
CREATE TYPE "RouteFleetPolicy" AS ENUM ('ALLOWED', 'FORBIDDEN');

ALTER TYPE "AircraftLocationSource" ADD VALUE IF NOT EXISTS 'NATIVE_DISPATCH';
ALTER TYPE "AircraftLocationSource" ADD VALUE IF NOT EXISTS 'NATIVE_ACARS';
ALTER TYPE "AircraftLocationSource" ADD VALUE IF NOT EXISTS 'NATIVE_PIREP';
ALTER TYPE "AircraftLocationSource" ADD VALUE IF NOT EXISTS 'VAMSYS_LEGACY';

ALTER TABLE "Fleet"
  ADD COLUMN "iataType" TEXT,
  ADD COLUMN "manufacturer" TEXT,
  ADD COLUMN "family" TEXT,
  ADD COLUMN "variant" TEXT,
  ADD COLUMN "engineType" TEXT,
  ADD COLUMN "typicalSeatCapacity" INTEGER,
  ADD COLUMN "rangeNm" INTEGER,
  ADD COLUMN "cruiseSpeedKts" INTEGER,
  ADD COLUMN "defaultCruiseAltitudeFt" INTEGER,
  ADD COLUMN "etopsMinutes" INTEGER,
  ADD COLUMN "operationalStatus" "FleetOperationalStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "Fleet" SET "operationalStatus" = CASE WHEN "active" THEN 'ACTIVE'::"FleetOperationalStatus" ELSE 'SUSPENDED'::"FleetOperationalStatus" END;

ALTER TABLE "Aircraft"
  ADD COLUMN "deliveryDate" DATE,
  ADD COLUMN "inServiceDate" DATE,
  ADD COLUMN "cabinConfiguration" TEXT,
  ADD COLUMN "operationalStatus" "NativeAircraftStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "totalFlightMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalCycles" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "Aircraft" SET "operationalStatus" = CASE
  WHEN UPPER(COALESCE("status", '')) IN ('AVAILABLE', 'RESERVED', 'DISPATCHED', 'IN_FLIGHT', 'TURNAROUND', 'MAINTENANCE', 'FERRY_ONLY', 'AOG', 'SUSPENDED', 'RETIRED') THEN UPPER("status")::"NativeAircraftStatus"
  ELSE 'UNKNOWN'::"NativeAircraftStatus"
END;

ALTER TABLE "AircraftConditionSnapshot" ADD COLUMN "aircraftId" TEXT;
ALTER TABLE "AircraftWearEvent" ADD COLUMN "aircraftId" TEXT;
ALTER TABLE "AircraftMaintenanceOrder" ADD COLUMN "aircraftId" TEXT;

UPDATE "AircraftLocationSnapshot" s SET "aircraftId" = a."id" FROM "Aircraft" a
WHERE s."aircraftId" IS NULL AND s."vamsysAircraftId" IS NOT NULL AND a."vamsysAircraftId" = s."vamsysAircraftId";
UPDATE "AircraftConditionSnapshot" s SET "aircraftId" = a."id" FROM "Aircraft" a
WHERE s."aircraftId" IS NULL AND a."vamsysAircraftId" = s."vamsysAircraftId";
UPDATE "AircraftWearEvent" s SET "aircraftId" = a."id" FROM "Aircraft" a
WHERE s."aircraftId" IS NULL AND a."vamsysAircraftId" = s."vamsysAircraftId";
UPDATE "AircraftMaintenanceOrder" s SET "aircraftId" = a."id" FROM "Aircraft" a
WHERE s."aircraftId" IS NULL AND a."vamsysAircraftId" = s."vamsysAircraftId";

CREATE UNIQUE INDEX "AircraftConditionSnapshot_aircraftId_key" ON "AircraftConditionSnapshot"("aircraftId");
CREATE INDEX "AircraftWearEvent_aircraftId_createdAt_idx" ON "AircraftWearEvent"("aircraftId", "createdAt");
CREATE INDEX "AircraftMaintenanceOrder_aircraftId_status_idx" ON "AircraftMaintenanceOrder"("aircraftId", "status");
CREATE INDEX "Fleet_code_idx_native" ON "Fleet"("code");
CREATE INDEX "Fleet_operationalStatus_idx" ON "Fleet"("operationalStatus");
CREATE INDEX "Aircraft_operationalStatus_idx" ON "Aircraft"("operationalStatus");

ALTER TABLE "AircraftConditionSnapshot" ADD CONSTRAINT "AircraftConditionSnapshot_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AircraftWearEvent" ADD CONSTRAINT "AircraftWearEvent_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AircraftMaintenanceOrder" ADD CONSTRAINT "AircraftMaintenanceOrder_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RouteFleetCompatibility" (
  "id" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "fleetId" TEXT NOT NULL,
  "policy" "RouteFleetPolicy" NOT NULL DEFAULT 'ALLOWED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RouteFleetCompatibility_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RouteFleetCompatibility_routeId_fleetId_key" ON "RouteFleetCompatibility"("routeId", "fleetId");
CREATE INDEX "RouteFleetCompatibility_fleetId_policy_idx" ON "RouteFleetCompatibility"("fleetId", "policy");
ALTER TABLE "RouteFleetCompatibility" ADD CONSTRAINT "RouteFleetCompatibility_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteFleetCompatibility" ADD CONSTRAINT "RouteFleetCompatibility_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "RouteFleetCompatibility" ("id", "routeId", "fleetId", "policy", "createdAt", "updatedAt")
SELECT 'rfc_' || md5(r."id" || ':' || r."defaultFleetId"), r."id", r."defaultFleetId", 'ALLOWED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Route" r WHERE r."defaultFleetId" IS NOT NULL
ON CONFLICT ("routeId", "fleetId") DO NOTHING;
