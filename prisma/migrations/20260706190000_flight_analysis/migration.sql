CREATE TABLE "FlightAnalysisReport" (
  "id" TEXT NOT NULL,
  "pirepId" TEXT NOT NULL,
  "ofpBriefingId" TEXT,
  "plannedBlockMinutes" INTEGER,
  "actualBlockMinutes" INTEGER,
  "blockTimeDiffMinutes" INTEGER,
  "plannedFlightMinutes" INTEGER,
  "actualFlightMinutes" INTEGER,
  "flightTimeDiffMinutes" INTEGER,
  "plannedTripFuelKg" INTEGER,
  "actualFuelUsedKg" INTEGER,
  "fuelDiffKg" INTEGER,
  "fuelDiffPercent" DOUBLE PRECISION,
  "plannedRoute" TEXT,
  "actualDistanceNm" INTEGER,
  "landingRate" INTEGER,
  "landingG" DOUBLE PRECISION,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlightAnalysisReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlightAnalysisReport_pirepId_key" ON "FlightAnalysisReport"("pirepId");
CREATE INDEX "FlightAnalysisReport_ofpBriefingId_idx" ON "FlightAnalysisReport"("ofpBriefingId");
CREATE INDEX "FlightAnalysisReport_fuelDiffPercent_idx" ON "FlightAnalysisReport"("fuelDiffPercent");
ALTER TABLE "FlightAnalysisReport" ADD CONSTRAINT "FlightAnalysisReport_pirepId_fkey" FOREIGN KEY ("pirepId") REFERENCES "Pirep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlightAnalysisReport" ADD CONSTRAINT "FlightAnalysisReport_ofpBriefingId_fkey" FOREIGN KEY ("ofpBriefingId") REFERENCES "OfpBriefing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

