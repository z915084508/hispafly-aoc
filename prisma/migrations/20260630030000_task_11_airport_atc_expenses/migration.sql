DO $$
BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "CompanyExpenseType" ADD VALUE IF NOT EXISTS 'airport_landing';
ALTER TYPE "CompanyExpenseType" ADD VALUE IF NOT EXISTS 'airport_passenger';
ALTER TYPE "CompanyExpenseType" ADD VALUE IF NOT EXISTS 'airport_service';
ALTER TYPE "CompanyExpenseType" ADD VALUE IF NOT EXISTS 'airport_parking';
ALTER TYPE "CompanyExpenseType" ADD VALUE IF NOT EXISTS 'handling';
ALTER TYPE "CompanyExpenseType" ADD VALUE IF NOT EXISTS 'cargo_handling';
ALTER TYPE "CompanyExpenseType" ADD VALUE IF NOT EXISTS 'atc_enroute';
ALTER TYPE "CompanyExpenseType" ADD VALUE IF NOT EXISTS 'atc_terminal';

ALTER TABLE "OperationsApiState" ADD COLUMN IF NOT EXISTS "lastAirportSyncAt" TIMESTAMP(3);

ALTER TABLE "Aircraft" ADD COLUMN IF NOT EXISTS "fleetId" TEXT;
ALTER TABLE "Aircraft" ADD COLUMN IF NOT EXISTS "fleetName" TEXT;
ALTER TABLE "Aircraft" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "Aircraft" ADD COLUMN IF NOT EXISTS "seatCapacity" INTEGER;
ALTER TABLE "Aircraft" ADD COLUMN IF NOT EXISTS "cargoCapacityKg" INTEGER;
ALTER TABLE "Aircraft" ADD COLUMN IF NOT EXISTS "mtowKg" INTEGER;

CREATE INDEX IF NOT EXISTS "Aircraft_registration_idx" ON "Aircraft"("registration");
CREATE INDEX IF NOT EXISTS "Aircraft_aircraftType_idx" ON "Aircraft"("aircraftType");

CREATE TABLE IF NOT EXISTS "AircraftProfile" (
  "id" TEXT NOT NULL,
  "aircraftType" TEXT NOT NULL,
  "seatCapacity" INTEGER,
  "cargoCapacityKg" INTEGER,
  "mtowKg" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'aoc_fallback',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AircraftProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AircraftProfile_aircraftType_key" ON "AircraftProfile"("aircraftType");

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

CREATE TABLE IF NOT EXISTS "AirportChargeProfile" (
  "id" TEXT NOT NULL,
  "airportIcao" TEXT NOT NULL,
  "airportCategory" TEXT NOT NULL DEFAULT 'standard',
  "landingRatePerTonneCents" INTEGER NOT NULL DEFAULT 0,
  "passengerFeeCents" INTEGER NOT NULL DEFAULT 0,
  "passengerServiceFeeCents" INTEGER NOT NULL DEFAULT 0,
  "parkingRatePerHourCents" INTEGER NOT NULL DEFAULT 0,
  "terminalAtcUnitRateCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AirportChargeProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AirportChargeProfile_airportIcao_key" ON "AirportChargeProfile"("airportIcao");

CREATE TABLE IF NOT EXISTS "AirspaceChargeProfile" (
  "id" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "unitRateCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AirspaceChargeProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AirspaceChargeProfile_region_key" ON "AirspaceChargeProfile"("region");

CREATE TABLE IF NOT EXISTS "CompanyExpense" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyExpense_pirepId_type_key" ON "CompanyExpense"("pirepId", "type");
CREATE INDEX IF NOT EXISTS "CompanyExpense_type_idx" ON "CompanyExpense"("type");
CREATE INDEX IF NOT EXISTS "CompanyExpense_createdAt_idx" ON "CompanyExpense"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanyExpense_pirepId_fkey'
  ) THEN
    ALTER TABLE "CompanyExpense" ADD CONSTRAINT "CompanyExpense_pirepId_fkey" FOREIGN KEY ("pirepId") REFERENCES "Pirep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
