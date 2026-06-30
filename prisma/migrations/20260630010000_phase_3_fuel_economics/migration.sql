ALTER TABLE "Pirep" ADD COLUMN IF NOT EXISTS "cargoKg" INTEGER;
ALTER TABLE "Pirep" ADD COLUMN IF NOT EXISTS "fuelCostCents" INTEGER;
ALTER TABLE "Pirep" ADD COLUMN IF NOT EXISTS "fuelPricePerKgCents" INTEGER;
ALTER TABLE "Pirep" ADD COLUMN IF NOT EXISTS "fuelPriceRegion" TEXT;
ALTER TABLE "Pirep" ADD COLUMN IF NOT EXISTS "fuelPriceSource" TEXT;

CREATE INDEX IF NOT EXISTS "Pirep_flownAt_fuelCostCents_idx" ON "Pirep"("flownAt", "fuelCostCents");

CREATE TABLE IF NOT EXISTS "FuelPrice" (
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

CREATE INDEX IF NOT EXISTS "FuelPrice_region_effectiveFrom_idx" ON "FuelPrice"("region", "effectiveFrom");
