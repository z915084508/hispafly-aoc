CREATE TYPE "AocDataOrigin" AS ENUM (
  'HISPAFLY_NATIVE',
  'VAMSYS_LEGACY',
  'IMPORTED',
  'MANUAL'
);

ALTER TABLE "Pilot"
  ADD COLUMN "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE';
ALTER TABLE "Fleet"
  ADD COLUMN "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE';
ALTER TABLE "Aircraft"
  ADD COLUMN "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE';
ALTER TABLE "Route"
  ADD COLUMN "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE';
ALTER TABLE "Pirep"
  ADD COLUMN "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE';
ALTER TABLE "FlightOffer"
  ADD COLUMN "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE';

UPDATE "Pilot" SET "dataOrigin" = 'VAMSYS_LEGACY'
WHERE "vamsysPilotId" IS NOT NULL OR "vamsysUserId" IS NOT NULL;
UPDATE "Fleet" SET "dataOrigin" = 'VAMSYS_LEGACY'
WHERE "vamsysFleetId" IS NOT NULL;
UPDATE "Aircraft" SET "dataOrigin" = 'VAMSYS_LEGACY'
WHERE "vamsysAircraftId" IS NOT NULL;
UPDATE "Route" SET "dataOrigin" = 'VAMSYS_LEGACY'
WHERE "vamsysRouteId" IS NOT NULL;
UPDATE "Pirep" SET "dataOrigin" = 'VAMSYS_LEGACY'
WHERE "vamsysPirepId" IS NOT NULL;
UPDATE "FlightOffer" SET "dataOrigin" = 'VAMSYS_LEGACY'
WHERE "vamsysRouteId" IS NOT NULL OR "vamsysAircraftId" IS NOT NULL;

CREATE INDEX "Pilot_dataOrigin_idx" ON "Pilot"("dataOrigin");
CREATE INDEX "Fleet_dataOrigin_idx" ON "Fleet"("dataOrigin");
CREATE INDEX "Aircraft_dataOrigin_idx" ON "Aircraft"("dataOrigin");
CREATE INDEX "Route_dataOrigin_idx" ON "Route"("dataOrigin");
CREATE INDEX "Pirep_dataOrigin_idx" ON "Pirep"("dataOrigin");
CREATE INDEX "FlightOffer_dataOrigin_idx" ON "FlightOffer"("dataOrigin");
