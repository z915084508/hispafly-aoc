CREATE TYPE "RouteSyncStatus" AS ENUM ('LOCAL_DRAFT', 'PUBLISHING', 'SYNCED', 'UPDATE_PENDING', 'SYNC_ERROR', 'MISSING', 'ARCHIVED');
CREATE TYPE "RouteOperationalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'HIDDEN', 'ARCHIVED');

ALTER TABLE "OperationsApiState"
  ADD COLUMN "lastRouteSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastRouteSyncStatus" TEXT,
  ADD COLUMN "lastRouteSyncError" TEXT,
  ADD COLUMN "lastRouteSyncImported" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastRouteSyncUpdated" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastRouteSyncMissing" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Route" ALTER COLUMN "vamsysRouteId" DROP NOT NULL;
UPDATE "Route" SET "departure" = 'ZZZZ' WHERE "departure" IS NULL;
UPDATE "Route" SET "arrival" = 'ZZZZ' WHERE "arrival" IS NULL;
ALTER TABLE "Route"
  ALTER COLUMN "departure" SET NOT NULL,
  ALTER COLUMN "arrival" SET NOT NULL,
  ADD COLUMN "callsign" TEXT,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "route" TEXT,
  ADD COLUMN "scheduledDurationMinutes" INTEGER,
  ADD COLUMN "distanceNm" INTEGER,
  ADD COLUMN "cruiseAltitude" INTEGER,
  ADD COLUMN "costIndex" INTEGER,
  ADD COLUMN "defaultPassengers" INTEGER,
  ADD COLUMN "defaultCargoKg" INTEGER,
  ADD COLUMN "minimumRankId" TEXT,
  ADD COLUMN "hubId" TEXT,
  ADD COLUMN "operationalStatus" "RouteOperationalStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "syncStatus" "RouteSyncStatus" NOT NULL DEFAULT 'LOCAL_DRAFT',
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "lastPublishedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncError" TEXT;

UPDATE "Route" SET "operationalStatus" = 'ACTIVE', "syncStatus" = 'SYNCED', "lastSeenAt" = "updatedAt", "lastSyncedAt" = "updatedAt" WHERE "vamsysRouteId" IS NOT NULL;

CREATE TABLE "RouteFleetAssignment" (
  "id" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "fleetId" TEXT NOT NULL,
  "vamsysRouteId" TEXT,
  "vamsysFleetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouteFleetAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RouteFleetAssignment_routeId_fleetId_key" ON "RouteFleetAssignment"("routeId", "fleetId");
CREATE INDEX "RouteFleetAssignment_vamsysRouteId_idx" ON "RouteFleetAssignment"("vamsysRouteId");
CREATE INDEX "RouteFleetAssignment_vamsysFleetId_idx" ON "RouteFleetAssignment"("vamsysFleetId");
CREATE INDEX "Route_departure_arrival_idx" ON "Route"("departure", "arrival");
CREATE INDEX "Route_flightNumber_idx" ON "Route"("flightNumber");
CREATE INDEX "Route_operationalStatus_idx" ON "Route"("operationalStatus");
CREATE INDEX "Route_syncStatus_idx" ON "Route"("syncStatus");
CREATE INDEX "Route_active_idx" ON "Route"("active");
CREATE INDEX "Route_lastSyncedAt_idx" ON "Route"("lastSyncedAt");
ALTER TABLE "RouteFleetAssignment" ADD CONSTRAINT "RouteFleetAssignment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteFleetAssignment" ADD CONSTRAINT "RouteFleetAssignment_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
