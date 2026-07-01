ALTER TABLE "FlightOffer"
ADD COLUMN "availableFrom" TIMESTAMP(3),
ADD COLUMN "estimatedDurationMinutes" INTEGER;

UPDATE "FlightOffer"
SET
  "availableFrom" = "scheduledDeparture",
  "estimatedDurationMinutes" = GREATEST(
    1,
    ROUND(EXTRACT(EPOCH FROM (COALESCE("scheduledArrival", "scheduledDeparture" + INTERVAL '1 hour') - "scheduledDeparture")) / 60)::INTEGER
  );

ALTER TABLE "FlightOffer"
ALTER COLUMN "availableFrom" SET NOT NULL,
ALTER COLUMN "estimatedDurationMinutes" SET NOT NULL,
ALTER COLUMN "scheduledDeparture" DROP NOT NULL;

ALTER TABLE "FlightDispatch"
ADD COLUMN "selectedDepartureAt" TIMESTAMP(3),
ADD COLUMN "estimatedArrivalAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "FlightOffer_scheduledDeparture_idx";
CREATE INDEX "FlightOffer_availableFrom_validUntil_idx"
ON "FlightOffer"("availableFrom", "validUntil");
