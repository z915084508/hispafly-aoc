CREATE TABLE "AirportCategoryChargeProfile" (
  "id" TEXT NOT NULL,
  "airportCategory" TEXT NOT NULL,
  "landingRatePerTonneCents" INTEGER NOT NULL DEFAULT 0,
  "passengerFeeCents" INTEGER NOT NULL DEFAULT 0,
  "passengerServiceFeeCents" INTEGER NOT NULL DEFAULT 0,
  "parkingRatePerHourCents" INTEGER NOT NULL DEFAULT 0,
  "terminalAtcUnitRateCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AirportCategoryChargeProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AirportCategoryChargeProfile_airportCategory_key" ON "AirportCategoryChargeProfile"("airportCategory");

INSERT INTO "AirportCategoryChargeProfile" (
  "id", "airportCategory", "landingRatePerTonneCents", "passengerFeeCents", "passengerServiceFeeCents", "parkingRatePerHourCents", "terminalAtcUnitRateCents", "currency", "createdAt", "updatedAt"
)
VALUES
  ('airport_category_mega_hub', 'mega_hub', 950, 1400, 750, 3000, 1100, 'EUR', now(), now()),
  ('airport_category_major', 'major', 850, 1200, 650, 2500, 900, 'EUR', now(), now()),
  ('airport_category_medium', 'medium', 650, 850, 450, 1800, 650, 'EUR', now(), now()),
  ('airport_category_small', 'small', 450, 550, 300, 1200, 400, 'EUR', now(), now()),
  ('airport_category_regional', 'regional', 500, 650, 350, 1400, 450, 'EUR', now(), now()),
  ('airport_category_standard', 'standard', 650, 850, 450, 1800, 650, 'EUR', now(), now())
ON CONFLICT ("airportCategory") DO UPDATE SET
  "landingRatePerTonneCents" = EXCLUDED."landingRatePerTonneCents",
  "passengerFeeCents" = EXCLUDED."passengerFeeCents",
  "passengerServiceFeeCents" = EXCLUDED."passengerServiceFeeCents",
  "parkingRatePerHourCents" = EXCLUDED."parkingRatePerHourCents",
  "terminalAtcUnitRateCents" = EXCLUDED."terminalAtcUnitRateCents",
  "updatedAt" = now();

INSERT INTO "AirspaceChargeProfile" ("id", "region", "unitRateCents", "currency", "createdAt", "updatedAt")
VALUES
  ('airspace_europe', 'EUROPE', 7800, 'EUR', now(), now()),
  ('airspace_north_america', 'NORTH_AMERICA', 6500, 'EUR', now(), now()),
  ('airspace_asia', 'ASIA', 7000, 'EUR', now(), now()),
  ('airspace_middle_east', 'MIDDLE_EAST', 7200, 'EUR', now(), now()),
  ('airspace_global', 'GLOBAL', 6800, 'EUR', now(), now())
ON CONFLICT ("region") DO UPDATE SET
  "unitRateCents" = EXCLUDED."unitRateCents",
  "updatedAt" = now();

INSERT INTO "AircraftProfile" ("id", "aircraftType", "seatCapacity", "cargoCapacityKg", "mtowKg", "source", "createdAt", "updatedAt")
VALUES
  ('aircraft_profile_a320', 'A320', 180, 4000, 78000, 'aoc_default_template', now(), now()),
  ('aircraft_profile_a20n', 'A20N', 186, 4200, 79000, 'aoc_default_template', now(), now()),
  ('aircraft_profile_a321', 'A321', 220, 5200, 97000, 'aoc_default_template', now(), now()),
  ('aircraft_profile_a21n', 'A21N', 236, 5500, 97000, 'aoc_default_template', now(), now()),
  ('aircraft_profile_b738', 'B738', 189, 5000, 79000, 'aoc_default_template', now(), now()),
  ('aircraft_profile_b38m', 'B38M', 189, 5200, 82190, 'aoc_default_template', now(), now()),
  ('aircraft_profile_b772', 'B772', 320, 18000, 247000, 'aoc_default_template', now(), now()),
  ('aircraft_profile_b77w', 'B77W', 365, 21000, 351500, 'aoc_default_template', now(), now()),
  ('aircraft_profile_a359', 'A359', 315, 20000, 280000, 'aoc_default_template', now(), now()),
  ('aircraft_profile_a388', 'A388', 520, 38000, 575000, 'aoc_default_template', now(), now())
ON CONFLICT ("aircraftType") DO UPDATE SET
  "seatCapacity" = EXCLUDED."seatCapacity",
  "cargoCapacityKg" = EXCLUDED."cargoCapacityKg",
  "mtowKg" = EXCLUDED."mtowKg",
  "updatedAt" = now();
