CREATE TYPE "OfpStatus" AS ENUM ('GENERATED', 'AWAITING_SIGNATURE', 'SIGNED', 'VOIDED');

ALTER TABLE "Pilot" ADD COLUMN "simbriefUserId" TEXT;

ALTER TABLE "Aircraft" ADD COLUMN "fuelOnBoardKg" INTEGER, ADD COLUMN "fuelReportedAt" TIMESTAMP(3);

CREATE TABLE "AircraftPerformanceProfile" (
  "id" TEXT NOT NULL, "aircraftId" TEXT NOT NULL,
  "operatingEmptyWeightKg" INTEGER, "maxZeroFuelWeightKg" INTEGER,
  "maxTakeoffWeightKg" INTEGER, "maxLandingWeightKg" INTEGER,
  "maxFuelKg" INTEGER, "maxPayloadKg" INTEGER, "defaultCostIndex" INTEGER,
  "fuelBiasPercent" DOUBLE PRECISION NOT NULL DEFAULT 0, "taxiFuelKg" INTEGER,
  "sampleSize" INTEGER NOT NULL DEFAULT 0, "locked" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AircraftPerformanceProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AircraftPerformanceProfile_aircraftId_key" ON "AircraftPerformanceProfile"("aircraftId");
ALTER TABLE "AircraftPerformanceProfile" ADD CONSTRAINT "AircraftPerformanceProfile_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Pirep"
  ADD COLUMN "vamsysAircraftId" TEXT, ADD COLUMN "aircraftRegistration" TEXT,
  ADD COLUMN "rampFuelKg" INTEGER, ADD COLUMN "takeoffFuelKg" INTEGER,
  ADD COLUMN "landingFuelKg" INTEGER, ADD COLUMN "fuelUpliftKg" INTEGER,
  ADD COLUMN "inheritedFuelKg" INTEGER, ADD COLUMN "luggageKg" INTEGER,
  ADD COLUMN "freightKg" INTEGER;
CREATE INDEX "Pirep_vamsysAircraftId_flownAt_idx" ON "Pirep"("vamsysAircraftId", "flownAt");

ALTER TABLE "FlightOffer"
  ADD COLUMN "loadFactorPercent" DOUBLE PRECISION,
  ADD COLUMN "luggageKg" INTEGER,
  ADD COLUMN "freightKg" INTEGER DEFAULT 0,
  ADD COLUMN "baggageKgPerPassenger" DOUBLE PRECISION;

CREATE TABLE "OfpBriefing" (
  "id" TEXT NOT NULL, "flightDispatchId" TEXT NOT NULL,
  "status" "OfpStatus" NOT NULL DEFAULT 'GENERATED', "version" INTEGER NOT NULL DEFAULT 1,
  "simbriefStaticId" TEXT NOT NULL, "simbriefUserId" TEXT, "ofpUrl" TEXT, "pdfUrl" TEXT,
  "ofpSnapshot" JSONB, "contentHash" TEXT NOT NULL, "signedByPilotId" TEXT,
  "signedByName" TEXT, "signedByCallsign" TEXT, "signatureData" TEXT,
  "acceptanceText" TEXT, "signedAt" TIMESTAMP(3), "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfpBriefing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfpBriefing_flightDispatchId_key" ON "OfpBriefing"("flightDispatchId");
CREATE UNIQUE INDEX "OfpBriefing_simbriefStaticId_key" ON "OfpBriefing"("simbriefStaticId");
CREATE INDEX "OfpBriefing_status_signedAt_idx" ON "OfpBriefing"("status", "signedAt");
ALTER TABLE "OfpBriefing" ADD CONSTRAINT "OfpBriefing_flightDispatchId_fkey" FOREIGN KEY ("flightDispatchId") REFERENCES "FlightDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
