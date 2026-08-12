CREATE TABLE "AircraftHub" (
    "aircraftId" TEXT NOT NULL,
    "airportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AircraftHub_pkey" PRIMARY KEY ("aircraftId", "airportId")
);

CREATE INDEX "AircraftHub_airportId_idx" ON "AircraftHub"("airportId");

ALTER TABLE "AircraftHub" ADD CONSTRAINT "AircraftHub_aircraftId_fkey"
FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AircraftHub" ADD CONSTRAINT "AircraftHub_airportId_fkey"
FOREIGN KEY ("airportId") REFERENCES "Airport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
