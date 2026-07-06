CREATE TABLE "EfbPerformanceCalculation" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "ofpBriefingId" TEXT,
  "flightDispatchId" TEXT,
  "vamsysBookingId" TEXT,
  "type" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'MANUAL',
  "airportIcao" TEXT NOT NULL,
  "runway" TEXT,
  "aircraftType" TEXT NOT NULL,
  "aircraftRegistration" TEXT,
  "weightKg" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'simbrief_v2',
  "input" JSONB NOT NULL,
  "result" JSONB,
  "status" TEXT NOT NULL,
  "warningLevel" TEXT,
  "errorMessage" TEXT,
  "officialForDeparture" BOOLEAN NOT NULL DEFAULT false,
  "usedForReadyForDeparture" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EfbPerformanceCalculation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EfbDepartureReadiness" (
  "id" TEXT NOT NULL,
  "flightDispatchId" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "takeoffPerformanceId" TEXT,
  "blockingReason" TEXT,
  "warnings" JSONB,
  "readyAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EfbDepartureReadiness_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EfbPerformanceCalculation_pilotId_createdAt_idx" ON "EfbPerformanceCalculation"("pilotId", "createdAt");
CREATE INDEX "EfbPerformanceCalculation_ofpBriefingId_idx" ON "EfbPerformanceCalculation"("ofpBriefingId");
CREATE INDEX "EfbPerformanceCalculation_flightDispatchId_idx" ON "EfbPerformanceCalculation"("flightDispatchId");
CREATE INDEX "EfbPerformanceCalculation_vamsysBookingId_idx" ON "EfbPerformanceCalculation"("vamsysBookingId");
CREATE INDEX "EfbPerformanceCalculation_type_airportIcao_idx" ON "EfbPerformanceCalculation"("type", "airportIcao");
CREATE UNIQUE INDEX "EfbDepartureReadiness_flightDispatchId_key" ON "EfbDepartureReadiness"("flightDispatchId");
CREATE INDEX "EfbDepartureReadiness_pilotId_status_idx" ON "EfbDepartureReadiness"("pilotId", "status");
ALTER TABLE "EfbPerformanceCalculation" ADD CONSTRAINT "EfbPerformanceCalculation_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EfbDepartureReadiness" ADD CONSTRAINT "EfbDepartureReadiness_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
