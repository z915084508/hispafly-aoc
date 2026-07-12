CREATE TYPE "FleetSyncStatus" AS ENUM ('LOCAL_DRAFT', 'PUBLISHING', 'SYNCED', 'UPDATE_PENDING', 'SYNC_ERROR', 'MISSING');
ALTER TABLE "Fleet" ALTER COLUMN "vamsysFleetId" DROP NOT NULL;
ALTER TABLE "Fleet"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "type" TEXT,
  ADD COLUMN "maxPassengers" INTEGER,
  ADD COLUMN "maxCargoKg" INTEGER,
  ADD COLUMN "containerUnits" INTEGER,
  ADD COLUMN "hiddenInPhoenix" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "scoringGroupId" TEXT,
  ADD COLUMN "simbriefAircraftProfiles" JSONB,
  ADD COLUMN "simbriefOverrides" JSONB,
  ADD COLUMN "parameterIds" JSONB,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "imageAttribution" TEXT,
  ADD COLUMN "imageLinkback" TEXT,
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "syncStatus" "FleetSyncStatus" NOT NULL DEFAULT 'LOCAL_DRAFT',
  ADD COLUMN "sourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "lastPublishedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncError" TEXT;
UPDATE "Fleet" SET "syncStatus"='SYNCED', "lastSeenAt"="updatedAt", "lastSyncedAt"="updatedAt" WHERE "vamsysFleetId" IS NOT NULL;
CREATE INDEX "Fleet_code_idx" ON "Fleet"("code");
CREATE INDEX "Fleet_type_idx" ON "Fleet"("type");
CREATE INDEX "Fleet_syncStatus_idx" ON "Fleet"("syncStatus");
CREATE INDEX "Fleet_hiddenInPhoenix_idx" ON "Fleet"("hiddenInPhoenix");
