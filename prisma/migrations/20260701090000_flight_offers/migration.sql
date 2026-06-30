CREATE TYPE "FlightOfferStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISPATCHED', 'FLOWN', 'EXPIRED', 'CANCELLED');
CREATE TYPE "FlightDispatchStatus" AS ENUM ('DISPATCHING', 'DISPATCHED', 'FLOWN', 'REWARDED', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "FlightOfferRewardType" AS ENUM ('FIXED', 'PERCENTAGE');

ALTER TABLE "Pirep" ADD COLUMN "vamsysBookingId" TEXT;
CREATE INDEX "Pirep_vamsysBookingId_idx" ON "Pirep"("vamsysBookingId");

CREATE TABLE "FlightOffer" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "flightNumber" TEXT,
  "callsign" TEXT,
  "departureIcao" TEXT NOT NULL,
  "arrivalIcao" TEXT NOT NULL,
  "vamsysRouteId" TEXT NOT NULL,
  "vamsysAircraftId" TEXT NOT NULL,
  "vamsysFleetId" TEXT,
  "scheduledDeparture" TIMESTAMP(3) NOT NULL,
  "scheduledArrival" TIMESTAMP(3),
  "aircraftType" TEXT,
  "aircraftRegistration" TEXT,
  "passengers" INTEGER,
  "cargoKg" INTEGER,
  "altitude" INTEGER,
  "network" TEXT,
  "userRoute" TEXT,
  "rewardCents" INTEGER NOT NULL DEFAULT 0,
  "rewardType" "FlightOfferRewardType" NOT NULL DEFAULT 'FIXED',
  "validUntil" TIMESTAMP(3) NOT NULL,
  "status" "FlightOfferStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByStaffId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlightOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlightDispatch" (
  "id" TEXT NOT NULL,
  "flightOfferId" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "status" "FlightDispatchStatus" NOT NULL DEFAULT 'DISPATCHED',
  "vamsysBookingId" TEXT,
  "vamsysPirepId" TEXT,
  "matchedPirepId" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "rewardedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlightDispatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WalletTransaction" ADD COLUMN "flightDispatchId" TEXT;

CREATE UNIQUE INDEX "FlightDispatch_vamsysBookingId_key" ON "FlightDispatch"("vamsysBookingId");
CREATE UNIQUE INDEX "FlightDispatch_matchedPirepId_key" ON "FlightDispatch"("matchedPirepId");
CREATE UNIQUE INDEX "FlightDispatch_flightOfferId_key" ON "FlightDispatch"("flightOfferId");
CREATE INDEX "FlightDispatch_pilotId_status_idx" ON "FlightDispatch"("pilotId", "status");
CREATE INDEX "FlightDispatch_flightOfferId_status_idx" ON "FlightDispatch"("flightOfferId", "status");
CREATE INDEX "FlightOffer_status_validUntil_idx" ON "FlightOffer"("status", "validUntil");
CREATE INDEX "FlightOffer_scheduledDeparture_idx" ON "FlightOffer"("scheduledDeparture");
CREATE UNIQUE INDEX "WalletTransaction_flightDispatchId_key" ON "WalletTransaction"("flightDispatchId");

ALTER TABLE "FlightOffer" ADD CONSTRAINT "FlightOffer_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlightDispatch" ADD CONSTRAINT "FlightDispatch_flightOfferId_fkey" FOREIGN KEY ("flightOfferId") REFERENCES "FlightOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlightDispatch" ADD CONSTRAINT "FlightDispatch_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FlightDispatch" ADD CONSTRAINT "FlightDispatch_matchedPirepId_fkey" FOREIGN KEY ("matchedPirepId") REFERENCES "Pirep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_flightDispatchId_fkey" FOREIGN KEY ("flightDispatchId") REFERENCES "FlightDispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
