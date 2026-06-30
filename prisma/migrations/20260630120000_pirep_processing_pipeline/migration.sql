CREATE TYPE "CompanyExpenseType" AS ENUM (
  'airport_landing',
  'airport_passenger',
  'airport_service',
  'airport_parking',
  'handling',
  'cargo_handling',
  'atc_enroute',
  'atc_terminal'
);

CREATE TABLE IF NOT EXISTS "Airport" (
  "id" TEXT NOT NULL,
  "icao" TEXT NOT NULL,
  "iata" TEXT,
  "name" TEXT,
  "city" TEXT,
  "country" TEXT,
  "region" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "source" TEXT NOT NULL DEFAULT 'vamsys_operations',
  "rawData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Airport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Airport_icao_key" ON "Airport"("icao");
CREATE INDEX IF NOT EXISTS "Airport_iata_idx" ON "Airport"("iata");
CREATE INDEX IF NOT EXISTS "Airport_region_idx" ON "Airport"("region");

CREATE TABLE "CompanyExpense" (
  "id" TEXT NOT NULL,
  "pirepId" TEXT NOT NULL,
  "type" "CompanyExpenseType" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "source" TEXT NOT NULL DEFAULT 'aoc_economy_rules',
  "calculationDetails" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyExpense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyExpense_pirepId_type_key" ON "CompanyExpense"("pirepId", "type");
CREATE INDEX "CompanyExpense_type_idx" ON "CompanyExpense"("type");
CREATE INDEX "CompanyExpense_createdAt_idx" ON "CompanyExpense"("createdAt");

ALTER TABLE "CompanyExpense"
  ADD CONSTRAINT "CompanyExpense_pirepId_fkey"
  FOREIGN KEY ("pirepId") REFERENCES "Pirep"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
