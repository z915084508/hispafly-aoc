ALTER TABLE "Pirep"
ADD COLUMN "passengers" INTEGER,
ADD COLUMN "flightDistanceNm" INTEGER,
ADD COLUMN "passengerRevenueCents" INTEGER;

CREATE INDEX "Pirep_flownAt_passengerRevenueCents_idx" ON "Pirep"("flownAt", "passengerRevenueCents");
