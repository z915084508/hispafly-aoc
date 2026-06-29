ALTER TABLE "Pirep"
ADD COLUMN "cargoKg" INTEGER,
ADD COLUMN "fuelCostCents" INTEGER,
ADD COLUMN "fuelPricePerKgCents" INTEGER,
ADD COLUMN "fuelPriceRegion" TEXT,
ADD COLUMN "fuelPriceSource" TEXT;

CREATE INDEX "Pirep_flownAt_fuelCostCents_idx" ON "Pirep"("flownAt", "fuelCostCents");

CREATE TABLE "FuelPrice" (
  "id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "pricePerKgCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "source" TEXT NOT NULL DEFAULT 'IATA Jet Fuel Price Monitor',
  "sourceUrl" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "manuallyMaintained" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FuelPrice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FuelPrice_region_effectiveFrom_idx" ON "FuelPrice"("region", "effectiveFrom");
