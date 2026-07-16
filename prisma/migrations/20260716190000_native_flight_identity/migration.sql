CREATE TYPE "AirportStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "FlightScheduleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "NativeFlightStatus" AS ENUM (
  'SCHEDULED', 'OPEN', 'BOOKED', 'DISPATCHED', 'BOARDING', 'DEPARTED',
  'AIRBORNE', 'LANDED', 'COMPLETED', 'CANCELLED', 'DIVERTED'
);

ALTER TABLE "Airport"
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "status" "AirportStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE',
  ADD COLUMN "legacyVamsysId" TEXT;

UPDATE "Airport"
SET "icao" = upper(btrim("icao")),
    "iata" = CASE WHEN "iata" IS NULL THEN NULL ELSE upper(btrim("iata")) END,
    "dataOrigin" = CASE
      WHEN lower(coalesce("source", '')) LIKE '%vamsys%' THEN 'VAMSYS_LEGACY'::"AocDataOrigin"
      ELSE "dataOrigin"
    END;

ALTER TABLE "Airport" ALTER COLUMN "source" SET DEFAULT 'hispafly_native';
CREATE UNIQUE INDEX "Airport_legacyVamsysId_key" ON "Airport"("legacyVamsysId");
CREATE INDEX "Airport_dataOrigin_idx" ON "Airport"("dataOrigin");
CREATE INDEX "Airport_status_idx" ON "Airport"("status");

ALTER TABLE "Fleet" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Aircraft"
  ALTER COLUMN "vamsysAircraftId" DROP NOT NULL,
  ADD COLUMN "nativeFleetId" TEXT,
  ADD COLUMN "serialNumber" TEXT,
  ADD COLUMN "currentAirportId" TEXT;

UPDATE "Aircraft"
SET "registration" = CASE WHEN "registration" IS NULL THEN NULL ELSE upper(replace(btrim("registration"), ' ', '')) END,
    "nativeFleetId" = fleet."id"
FROM "Fleet" AS fleet
WHERE "Aircraft"."fleetId" IS NOT NULL
  AND fleet."vamsysFleetId" = "Aircraft"."fleetId";

DROP INDEX IF EXISTS "Aircraft_registration_idx";
CREATE UNIQUE INDEX "Aircraft_registration_key" ON "Aircraft"("registration");
CREATE INDEX "Aircraft_nativeFleetId_idx" ON "Aircraft"("nativeFleetId");
CREATE INDEX "Aircraft_currentAirportId_idx" ON "Aircraft"("currentAirportId");
ALTER TABLE "Aircraft"
  ADD CONSTRAINT "Aircraft_nativeFleetId_fkey" FOREIGN KEY ("nativeFleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Aircraft_currentAirportId_fkey" FOREIGN KEY ("currentAirportId") REFERENCES "Airport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Route"
  ADD COLUMN "routeCode" TEXT,
  ADD COLUMN "departureAirportId" TEXT,
  ADD COLUMN "arrivalAirportId" TEXT,
  ADD COLUMN "defaultFleetId" TEXT,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveUntil" TIMESTAMP(3);

UPDATE "Route" AS route
SET "departureAirportId" = departure."id"
FROM "Airport" AS departure
WHERE upper(route."departure") = departure."icao";

UPDATE "Route" AS route
SET "arrivalAirportId" = arrival."id"
FROM "Airport" AS arrival
WHERE upper(route."arrival") = arrival."icao";

CREATE INDEX "Route_departureAirportId_arrivalAirportId_idx" ON "Route"("departureAirportId", "arrivalAirportId");
CREATE INDEX "Route_defaultFleetId_idx" ON "Route"("defaultFleetId");
CREATE INDEX "Route_routeCode_idx" ON "Route"("routeCode");
ALTER TABLE "Route"
  ADD CONSTRAINT "Route_departureAirportId_fkey" FOREIGN KEY ("departureAirportId") REFERENCES "Airport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Route_arrivalAirportId_fkey" FOREIGN KEY ("arrivalAirportId") REFERENCES "Airport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Route_defaultFleetId_fkey" FOREIGN KEY ("defaultFleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RouteFleetAssignment" ALTER COLUMN "vamsysFleetId" DROP NOT NULL;

ALTER TABLE "AircraftLocationSnapshot"
  ADD COLUMN "aircraftId" TEXT;

UPDATE "AircraftLocationSnapshot" AS snapshot
SET "aircraftId" = aircraft."id"
FROM "Aircraft" AS aircraft
WHERE snapshot."vamsysAircraftId" = aircraft."vamsysAircraftId";

UPDATE "AircraftLocationSnapshot" AS snapshot
SET "currentAirportId" = airport."id"
FROM "Airport" AS airport
WHERE upper(snapshot."currentAirportIcao") = airport."icao";

CREATE UNIQUE INDEX "AircraftLocationSnapshot_aircraftId_key" ON "AircraftLocationSnapshot"("aircraftId");
CREATE INDEX "AircraftLocationSnapshot_currentAirportId_idx" ON "AircraftLocationSnapshot"("currentAirportId");
ALTER TABLE "AircraftLocationSnapshot"
  ADD CONSTRAINT "AircraftLocationSnapshot_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AircraftLocationSnapshot_currentAirportId_fkey" FOREIGN KEY ("currentAirportId") REFERENCES "Airport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FlightSchedule" (
  "id" TEXT NOT NULL,
  "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE',
  "routeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "daysOfWeek" INTEGER[],
  "departureTimeMinutesUtc" INTEGER NOT NULL,
  "arrivalTimeMinutesUtc" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveUntil" TIMESTAMP(3),
  "status" "FlightScheduleStatus" NOT NULL DEFAULT 'DRAFT',
  "legacyExternalReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlightSchedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FlightSchedule_routeId_code_effectiveFrom_key" ON "FlightSchedule"("routeId", "code", "effectiveFrom");
CREATE INDEX "FlightSchedule_routeId_status_idx" ON "FlightSchedule"("routeId", "status");
CREATE INDEX "FlightSchedule_effectiveFrom_effectiveUntil_idx" ON "FlightSchedule"("effectiveFrom", "effectiveUntil");
CREATE INDEX "FlightSchedule_dataOrigin_idx" ON "FlightSchedule"("dataOrigin");
ALTER TABLE "FlightSchedule" ADD CONSTRAINT "FlightSchedule_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Flight" (
  "id" TEXT NOT NULL,
  "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE',
  "routeId" TEXT NOT NULL,
  "scheduleId" TEXT,
  "operatingDate" DATE NOT NULL,
  "scheduledDeparture" TIMESTAMP(3) NOT NULL,
  "scheduledArrival" TIMESTAMP(3) NOT NULL,
  "flightNumber" TEXT NOT NULL,
  "callsign" TEXT NOT NULL,
  "assignedAircraftId" TEXT,
  "status" "NativeFlightStatus" NOT NULL DEFAULT 'SCHEDULED',
  "legacyExternalReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Flight_operatingDate_flightNumber_scheduledDeparture_key" ON "Flight"("operatingDate", "flightNumber", "scheduledDeparture");
CREATE INDEX "Flight_routeId_operatingDate_idx" ON "Flight"("routeId", "operatingDate");
CREATE INDEX "Flight_scheduleId_operatingDate_idx" ON "Flight"("scheduleId", "operatingDate");
CREATE INDEX "Flight_assignedAircraftId_scheduledDeparture_scheduledArrival_idx" ON "Flight"("assignedAircraftId", "scheduledDeparture", "scheduledArrival");
CREATE INDEX "Flight_status_scheduledDeparture_idx" ON "Flight"("status", "scheduledDeparture");
CREATE INDEX "Flight_dataOrigin_idx" ON "Flight"("dataOrigin");
ALTER TABLE "Flight"
  ADD CONSTRAINT "Flight_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Flight_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "FlightSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Flight_assignedAircraftId_fkey" FOREIGN KEY ("assignedAircraftId") REFERENCES "Aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FlightOffer"
  ADD COLUMN "routeId" TEXT,
  ADD COLUMN "flightId" TEXT,
  ADD COLUMN "aircraftId" TEXT,
  ADD COLUMN "fleetId" TEXT;
UPDATE "FlightOffer" AS offer
SET "routeId" = route."id"
FROM "Route" AS route
WHERE offer."vamsysRouteId" = route."vamsysRouteId";
UPDATE "FlightOffer" AS offer
SET "aircraftId" = aircraft."id"
FROM "Aircraft" AS aircraft
WHERE offer."vamsysAircraftId" = aircraft."vamsysAircraftId";
UPDATE "FlightOffer" AS offer
SET "fleetId" = fleet."id"
FROM "Fleet" AS fleet
WHERE offer."vamsysFleetId" = fleet."vamsysFleetId";
CREATE INDEX "FlightOffer_routeId_idx" ON "FlightOffer"("routeId");
CREATE INDEX "FlightOffer_flightId_idx" ON "FlightOffer"("flightId");
CREATE INDEX "FlightOffer_aircraftId_idx" ON "FlightOffer"("aircraftId");
ALTER TABLE "FlightOffer"
  ADD CONSTRAINT "FlightOffer_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FlightOffer_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FlightOffer_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FlightOffer_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PilotBooking"
  ALTER COLUMN "vamsysBookingId" DROP NOT NULL,
  ALTER COLUMN "vamsysRouteId" DROP NOT NULL,
  ALTER COLUMN "vamsysAircraftId" DROP NOT NULL,
  ADD COLUMN "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE',
  ADD COLUMN "flightId" TEXT,
  ADD COLUMN "routeId" TEXT,
  ADD COLUMN "aircraftId" TEXT;
UPDATE "PilotBooking" SET "dataOrigin" = 'VAMSYS_LEGACY' WHERE "vamsysBookingId" IS NOT NULL;
UPDATE "PilotBooking" AS booking
SET "routeId" = route."id"
FROM "Route" AS route
WHERE booking."vamsysRouteId" = route."vamsysRouteId";
UPDATE "PilotBooking" AS booking
SET "aircraftId" = aircraft."id"
FROM "Aircraft" AS aircraft
WHERE booking."vamsysAircraftId" = aircraft."vamsysAircraftId";
CREATE UNIQUE INDEX "PilotBooking_pilotId_flightId_key" ON "PilotBooking"("pilotId", "flightId");
CREATE INDEX "PilotBooking_flightId_idx" ON "PilotBooking"("flightId");
CREATE INDEX "PilotBooking_routeId_idx" ON "PilotBooking"("routeId");
CREATE INDEX "PilotBooking_aircraftId_selectedDepartureAt_estimatedArrivalAt_idx" ON "PilotBooking"("aircraftId", "selectedDepartureAt", "estimatedArrivalAt");
CREATE INDEX "PilotBooking_dataOrigin_idx" ON "PilotBooking"("dataOrigin");
ALTER TABLE "PilotBooking"
  ADD CONSTRAINT "PilotBooking_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PilotBooking_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PilotBooking_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FlightDispatch"
  ADD COLUMN "dataOrigin" "AocDataOrigin" NOT NULL DEFAULT 'HISPAFLY_NATIVE',
  ADD COLUMN "bookingId" TEXT,
  ADD COLUMN "flightId" TEXT,
  ADD COLUMN "routeId" TEXT,
  ADD COLUMN "aircraftId" TEXT,
  ADD COLUMN "acarsSessionId" TEXT;
UPDATE "FlightDispatch" SET "dataOrigin" = 'VAMSYS_LEGACY' WHERE "vamsysBookingId" IS NOT NULL OR "vamsysPirepId" IS NOT NULL;
UPDATE "FlightDispatch" AS dispatch
SET "routeId" = offer."routeId",
    "aircraftId" = offer."aircraftId"
FROM "FlightOffer" AS offer
WHERE dispatch."flightOfferId" = offer."id";
CREATE UNIQUE INDEX "FlightDispatch_bookingId_key" ON "FlightDispatch"("bookingId");
CREATE INDEX "FlightDispatch_flightId_status_idx" ON "FlightDispatch"("flightId", "status");
CREATE INDEX "FlightDispatch_routeId_idx" ON "FlightDispatch"("routeId");
CREATE INDEX "FlightDispatch_aircraftId_status_idx" ON "FlightDispatch"("aircraftId", "status");
CREATE INDEX "FlightDispatch_dataOrigin_idx" ON "FlightDispatch"("dataOrigin");
ALTER TABLE "FlightDispatch"
  ADD CONSTRAINT "FlightDispatch_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "PilotBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FlightDispatch_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FlightDispatch_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FlightDispatch_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
