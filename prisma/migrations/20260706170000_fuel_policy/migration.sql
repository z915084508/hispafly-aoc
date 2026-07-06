CREATE TABLE "FuelPolicyProfile" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "aircraftCategory" TEXT,
  "routeType" TEXT,
  "region" TEXT,
  "contingencyRule" TEXT NOT NULL,
  "finalReserveRule" TEXT NOT NULL,
  "taxiFuelKg" INTEGER,
  "minFobKg" INTEGER,
  "minArrivalFuelKg" INTEGER,
  "atcFuelMinutes" INTEGER,
  "weatherFuelMinutes" INTEGER,
  "melFuelKg" INTEGER,
  "extraFuelKg" INTEGER,
  "tankeringAllowed" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FuelPolicyProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OfpBriefing" ADD COLUMN "fuelPolicyProfileId" TEXT;
ALTER TABLE "OfpBriefing" ADD COLUMN "fuelPolicySnapshot" JSONB;
ALTER TABLE "OfpBriefing" ADD COLUMN "tankeringRecommendation" JSONB;
ALTER TABLE "OfpBriefing" ADD COLUMN "tankeringApplied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Pirep" ADD COLUMN "fuelCalculationDetails" JSONB;

CREATE INDEX "FuelPolicyProfile_active_routeType_region_idx" ON "FuelPolicyProfile"("active", "routeType", "region");
CREATE INDEX "FuelPolicyProfile_aircraftCategory_idx" ON "FuelPolicyProfile"("aircraftCategory");
ALTER TABLE "OfpBriefing" ADD CONSTRAINT "OfpBriefing_fuelPolicyProfileId_fkey" FOREIGN KEY ("fuelPolicyProfileId") REFERENCES "FuelPolicyProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "FuelPolicyProfile" ("id", "name", "scope", "routeType", "region", "contingencyRule", "finalReserveRule", "atcFuelMinutes", "weatherFuelMinutes", "tankeringAllowed", "active", "updatedAt") VALUES
('fuel-policy-europe-short-haul', 'Europe Short Haul', 'HISPAFLY', 'SHORT_HAUL', 'EUROPE', '0.05/15', '30', 10, 0, false, true, CURRENT_TIMESTAMP),
('fuel-policy-long-haul', 'Long Haul', 'HISPAFLY', 'LONG_HAUL', NULL, '0.03/20', '30', 15, 20, false, true, CURRENT_TIMESTAMP);
