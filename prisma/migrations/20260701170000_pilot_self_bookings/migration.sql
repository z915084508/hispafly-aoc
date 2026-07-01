CREATE TYPE "PilotBookingStatus" AS ENUM ('BOOKED', 'FLOWN', 'CANCELLED', 'FAILED');

CREATE TABLE "PilotBooking" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "vamsysBookingId" TEXT NOT NULL,
    "vamsysRouteId" TEXT NOT NULL,
    "vamsysAircraftId" TEXT NOT NULL,
    "vamsysFleetId" TEXT,
    "departureIcao" TEXT NOT NULL,
    "arrivalIcao" TEXT NOT NULL,
    "flightNumber" TEXT,
    "callsign" TEXT,
    "aircraftType" TEXT,
    "aircraftRegistration" TEXT,
    "selectedDepartureAt" TIMESTAMP(3) NOT NULL,
    "estimatedArrivalAt" TIMESTAMP(3),
    "estimatedDurationMinutes" INTEGER,
    "network" TEXT,
    "altitude" INTEGER,
    "passengers" INTEGER,
    "cargoKg" INTEGER,
    "userRoute" TEXT,
    "status" "PilotBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "matchedPirepId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PilotBooking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PilotBooking_vamsysBookingId_key" ON "PilotBooking"("vamsysBookingId");
CREATE UNIQUE INDEX "PilotBooking_matchedPirepId_key" ON "PilotBooking"("matchedPirepId");
CREATE INDEX "PilotBooking_pilotId_status_idx" ON "PilotBooking"("pilotId", "status");
CREATE INDEX "PilotBooking_selectedDepartureAt_idx" ON "PilotBooking"("selectedDepartureAt");
ALTER TABLE "PilotBooking" ADD CONSTRAINT "PilotBooking_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PilotBooking" ADD CONSTRAINT "PilotBooking_matchedPirepId_fkey" FOREIGN KEY ("matchedPirepId") REFERENCES "Pirep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
