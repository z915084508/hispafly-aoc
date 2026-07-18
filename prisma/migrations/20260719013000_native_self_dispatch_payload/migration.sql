ALTER TABLE "PilotBooking"
  ADD COLUMN "loadFactorPercent" DOUBLE PRECISION,
  ADD COLUMN "baggageKgPerPassenger" DOUBLE PRECISION,
  ADD COLUMN "luggageKg" INTEGER,
  ADD COLUMN "freightKg" INTEGER;
