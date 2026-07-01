CREATE TYPE "AircraftLocationStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'IN_FLIGHT', 'MAINTENANCE', 'UNKNOWN');
CREATE TYPE "AircraftLocationSource" AS ENUM ('MANUAL', 'PIREP', 'DISPATCH', 'ACARS', 'VAMSYS_EXTERNAL', 'IMPORTED');

CREATE TABLE "AircraftLocationSnapshot" (
  "id" TEXT NOT NULL,
  "vamsysAircraftId" TEXT NOT NULL,
  "registration" TEXT,
  "aircraftType" TEXT,
  "currentAirportId" TEXT,
  "currentAirportIcao" TEXT,
  "currentAirportIata" TEXT,
  "status" "AircraftLocationStatus" NOT NULL DEFAULT 'UNKNOWN',
  "source" "AircraftLocationSource" NOT NULL DEFAULT 'IMPORTED',
  "reservedByDispatchId" TEXT,
  "lastBookingId" TEXT,
  "lastPirepId" TEXT,
  "lastVamsysPirepId" TEXT,
  "lastLatitude" DOUBLE PRECISION,
  "lastLongitude" DOUBLE PRECISION,
  "lastAltitude" DOUBLE PRECISION,
  "lastGroundSpeed" DOUBLE PRECISION,
  "lastReportAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AircraftLocationSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AircraftLocationSnapshot_vamsysAircraftId_key" ON "AircraftLocationSnapshot"("vamsysAircraftId");
CREATE INDEX "AircraftLocationSnapshot_currentAirportIcao_idx" ON "AircraftLocationSnapshot"("currentAirportIcao");
CREATE INDEX "AircraftLocationSnapshot_status_idx" ON "AircraftLocationSnapshot"("status");
CREATE INDEX "AircraftLocationSnapshot_source_idx" ON "AircraftLocationSnapshot"("source");
CREATE INDEX "AircraftLocationSnapshot_lastBookingId_idx" ON "AircraftLocationSnapshot"("lastBookingId");
CREATE INDEX "AircraftLocationSnapshot_lastVamsysPirepId_idx" ON "AircraftLocationSnapshot"("lastVamsysPirepId");
