ALTER TYPE "PilotBookingStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "PilotBookingStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "PilotBookingStatus" ADD VALUE IF NOT EXISTS 'DISPATCH_PENDING';
ALTER TYPE "PilotBookingStatus" ADD VALUE IF NOT EXISTS 'DISPATCHED';
ALTER TYPE "PilotBookingStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "PilotBookingStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "PilotBookingStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "PilotBookingStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "PilotBooking"
  ADD COLUMN "fleetId" TEXT,
  ADD COLUMN "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "legacyReference" TEXT,
  ADD COLUMN "operationalNotes" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

UPDATE "PilotBooking"
SET "legacyReference" = "vamsysBookingId"
WHERE "vamsysBookingId" IS NOT NULL AND "legacyReference" IS NULL;

UPDATE "PilotBooking" b
SET "fleetId" = f."fleetId"
FROM "Flight" f
WHERE b."flightId" = f."id" AND b."fleetId" IS NULL;

ALTER TABLE "PilotBooking"
  ADD CONSTRAINT "PilotBooking_fleetId_fkey"
  FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PilotBooking_idempotencyKey_key" ON "PilotBooking"("idempotencyKey");
CREATE INDEX "PilotBooking_fleetId_status_idx" ON "PilotBooking"("fleetId", "status");
