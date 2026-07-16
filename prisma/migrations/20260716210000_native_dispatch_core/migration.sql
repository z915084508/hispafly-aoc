ALTER TYPE "FlightDispatchStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "FlightDispatchStatus" ADD VALUE IF NOT EXISTS 'PREPARING';
ALTER TYPE "FlightDispatchStatus" ADD VALUE IF NOT EXISTS 'CHECK_REQUIRED';
ALTER TYPE "FlightDispatchStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_RELEASE';
ALTER TYPE "FlightDispatchStatus" ADD VALUE IF NOT EXISTS 'RELEASED';
ALTER TYPE "FlightDispatchStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';
ALTER TYPE "FlightDispatchStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

ALTER TABLE "FlightDispatch"
  ADD COLUMN "fleetId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "releaseSnapshot" JSONB,
  ADD COLUMN "snapshotChecksum" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "supersededDispatchId" TEXT,
  ADD COLUMN "createdByPilotId" TEXT,
  ADD COLUMN "createdByStaffId" TEXT;
UPDATE "FlightDispatch" d SET "fleetId" = b."fleetId" FROM "PilotBooking" b WHERE d."bookingId" = b."id";
ALTER TABLE "FlightDispatch"
  ADD CONSTRAINT "FlightDispatch_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FlightDispatch_supersededDispatchId_fkey" FOREIGN KEY ("supersededDispatchId") REFERENCES "FlightDispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "FlightDispatch_idempotencyKey_key" ON "FlightDispatch"("idempotencyKey");
CREATE INDEX "FlightDispatch_bookingId_isCurrent_idx" ON "FlightDispatch"("bookingId", "isCurrent");
CREATE INDEX "FlightDispatch_status_expiresAt_idx" ON "FlightDispatch"("status", "expiresAt");
CREATE INDEX "FlightDispatch_fleetId_idx" ON "FlightDispatch"("fleetId");

ALTER TABLE "DispatchRelease"
  ADD COLUMN "actorType" TEXT,
  ADD COLUMN "actorDisplayName" TEXT,
  ADD COLUMN "dispatchVersion" INTEGER,
  ADD COLUMN "snapshotChecksum" TEXT,
  ADD COLUMN "acknowledgedWarnings" JSONB,
  ADD COLUMN "signatureComment" TEXT,
  ADD COLUMN "signedIpAddress" TEXT,
  ADD COLUMN "signedUserAgent" TEXT;
