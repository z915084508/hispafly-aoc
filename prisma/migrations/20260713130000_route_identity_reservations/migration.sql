CREATE TABLE "RouteIdentityReservation" (
  "id" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "flightNumber" TEXT NOT NULL,
  "callsign" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouteIdentityReservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RouteIdentityReservation_routeId_key" ON "RouteIdentityReservation"("routeId");
CREATE UNIQUE INDEX "RouteIdentityReservation_flightNumber_key" ON "RouteIdentityReservation"("flightNumber");
CREATE UNIQUE INDEX "RouteIdentityReservation_callsign_key" ON "RouteIdentityReservation"("callsign");
ALTER TABLE "RouteIdentityReservation" ADD CONSTRAINT "RouteIdentityReservation_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
