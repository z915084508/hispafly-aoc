ALTER TYPE "FlightScheduleStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "NativeFlightStatus" ADD VALUE IF NOT EXISTS 'OPEN_FOR_BOOKING';
ALTER TYPE "NativeFlightStatus" ADD VALUE IF NOT EXISTS 'DISPATCH_PENDING';
ALTER TYPE "NativeFlightStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "NativeFlightStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "NativeFlightStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "FlightSchedule"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "departureLocalTimeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "arrivalLocalTimeMinutes" INTEGER,
  ADD COLUMN "departureTimezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "arrivalTimezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "scheduledDurationMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "defaultFleetId" TEXT,
  ADD COLUMN "assignedAircraftId" TEXT,
  ADD COLUMN "bookingOpenOffsetMinutes" INTEGER NOT NULL DEFAULT 10080,
  ADD COLUMN "bookingCloseOffsetMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "generationHorizonDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "FlightSchedule"
SET "departureLocalTimeMinutes" = "departureTimeMinutesUtc",
    "arrivalLocalTimeMinutes" = "arrivalTimeMinutesUtc",
    "scheduledDurationMinutes" =
      CASE
        WHEN "arrivalTimeMinutesUtc" >= "departureTimeMinutesUtc"
          THEN "arrivalTimeMinutesUtc" - "departureTimeMinutesUtc"
        ELSE 1440 - "departureTimeMinutesUtc" + "arrivalTimeMinutesUtc"
      END;

ALTER TABLE "FlightSchedule"
  ADD CONSTRAINT "FlightSchedule_defaultFleetId_fkey"
    FOREIGN KEY ("defaultFleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FlightSchedule_assignedAircraftId_fkey"
    FOREIGN KEY ("assignedAircraftId") REFERENCES "Aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FlightSchedule_defaultFleetId_idx" ON "FlightSchedule"("defaultFleetId");
CREATE INDEX "FlightSchedule_assignedAircraftId_idx" ON "FlightSchedule"("assignedAircraftId");

ALTER TABLE "Flight"
  ADD COLUMN "departureAirportId" TEXT,
  ADD COLUMN "arrivalAirportId" TEXT,
  ADD COLUMN "scheduledDurationMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "departureIcao" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "arrivalIcao" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "departureTimezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "arrivalTimezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "departureLocalTime" TEXT NOT NULL DEFAULT '00:00',
  ADD COLUMN "arrivalLocalTime" TEXT NOT NULL DEFAULT '00:00',
  ADD COLUMN "fleetId" TEXT,
  ADD COLUMN "bookingOpenAt" TIMESTAMP(3),
  ADD COLUMN "bookingCloseAt" TIMESTAMP(3),
  ADD COLUMN "generationKey" TEXT,
  ADD COLUMN "operatingType" TEXT NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "manuallyModifiedAt" TIMESTAMP(3);

UPDATE "Flight" f
SET "departureAirportId" = r."departureAirportId",
    "arrivalAirportId" = r."arrivalAirportId",
    "departureIcao" = r."departure",
    "arrivalIcao" = r."arrival",
    "scheduledDurationMinutes" = GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (f."scheduledArrival" - f."scheduledDeparture")) / 60)::INTEGER),
    "departureLocalTime" = TO_CHAR(f."scheduledDeparture" AT TIME ZONE 'UTC', 'HH24:MI'),
    "arrivalLocalTime" = TO_CHAR(f."scheduledArrival" AT TIME ZONE 'UTC', 'HH24:MI')
FROM "Route" r
WHERE r."id" = f."routeId";

ALTER TABLE "Flight"
  ADD CONSTRAINT "Flight_departureAirportId_fkey"
    FOREIGN KEY ("departureAirportId") REFERENCES "Airport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Flight_arrivalAirportId_fkey"
    FOREIGN KEY ("arrivalAirportId") REFERENCES "Airport"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Flight_fleetId_fkey"
    FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Flight_generationKey_key" ON "Flight"("generationKey");
CREATE INDEX "Flight_departureAirportId_scheduledDeparture_idx" ON "Flight"("departureAirportId", "scheduledDeparture");
CREATE INDEX "Flight_arrivalAirportId_scheduledArrival_idx" ON "Flight"("arrivalAirportId", "scheduledArrival");
CREATE INDEX "Flight_fleetId_scheduledDeparture_idx" ON "Flight"("fleetId", "scheduledDeparture");
