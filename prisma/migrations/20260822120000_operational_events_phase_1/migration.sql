ALTER TABLE "Pirep"
  ADD COLUMN "plannedArrival" TEXT,
  ADD COLUMN "actualArrival" TEXT,
  ADD COLUMN "diversionReason" TEXT,
  ADD COLUMN "diverted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "OperationalEvent" (
  "id" TEXT NOT NULL,
  "pirepId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "timestamp" TIMESTAMP(3) NOT NULL,
  "flightPhase" TEXT,
  "source" TEXT NOT NULL DEFAULT 'ACARS_AUTO',
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "altitudeFeet" DOUBLE PRECISION,
  "groundSpeedKnots" DOUBLE PRECISION,
  "fuelKg" DOUBLE PRECISION,
  "aircraftSnapshot" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalEvent_pirepId_timestamp_idx" ON "OperationalEvent"("pirepId", "timestamp");
CREATE INDEX "OperationalEvent_eventType_timestamp_idx" ON "OperationalEvent"("eventType", "timestamp");
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_pirepId_fkey" FOREIGN KEY ("pirepId") REFERENCES "Pirep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
