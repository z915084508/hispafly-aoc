import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { declareAmnScheduledFlight, requestAmnPayload, signAmnPayloadAllocation, type AmnOperationalAirportMetadata } from "@/lib/amn/payload";

function toAmnAirportMetadata(airport: {
  iata: string | null;
  icao: string;
  name: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
}): AmnOperationalAirportMetadata {
  if (!airport.iata) throw new Error("The route requires IATA airport codes before AMN can allocate traffic.");
  const country = airport.country?.trim() || null;
  const region = airport.region?.trim().toUpperCase() || "";
  const regionIso2 = region.match(/^([A-Z]{2})(?:[-_]|$)/)?.[1] ?? null;
  const countryIso2 = regionIso2 ?? (country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null);
  return {
    iata: airport.iata.trim().toUpperCase(),
    icao: airport.icao.trim().toUpperCase(),
    name: airport.name,
    city: airport.city,
    country,
    countryIso2,
    timezone: airport.timezone,
    latitude: airport.latitude,
    longitude: airport.longitude,
  };
}

export async function POST(request: Request) {
  try {
    await requirePilotSession();
    const body = await request.json() as { routeId?: string; aircraftId?: string; departureAt?: string; idempotencyKey?: string };
    const departureAt = new Date(String(body.departureAt ?? ""));
    if (!body.routeId || !body.aircraftId || !body.idempotencyKey || Number.isNaN(departureAt.getTime())) throw new Error("Select a route, aircraft and valid UTC departure first.");
    const [route, aircraft] = await Promise.all([
      prisma.route.findFirst({ where: { id: body.routeId, active: true, operationalStatus: "ACTIVE" }, include: { departureAirport: true, arrivalAirport: true } }),
      prisma.aircraft.findFirst({ where: { id: body.aircraftId, archivedAt: null }, include: { locationSnapshot: true } }),
    ]);
    if (!route?.departureAirport?.iata || !route.arrivalAirport?.iata) throw new Error("The route requires IATA airport codes before AMN can allocate traffic.");
    if (!aircraft?.registration || !aircraft.aircraftType) throw new Error("The aircraft type and registration must be configured before requesting AMN Payload.");
    if ((aircraft.locationSnapshot?.currentAirportId ?? aircraft.currentAirportId) !== route.departureAirportId) throw new Error("The selected aircraft is not at the route departure airport.");
    const flightNumber = route.flightNumber?.trim();
    if (!flightNumber) throw new Error("The route requires a flight number before AMN can allocate traffic.");
    const operatingDate = departureAt.toISOString().slice(0, 10);
    const requestIdentity = createHash("sha256").update(`${body.idempotencyKey}|${route.id}|${operatingDate}|${aircraft.registration}`).digest("hex");
    const originAirport = toAmnAirportMetadata(route.departureAirport);
    const destinationAirport = toAmnAirportMetadata(route.arrivalAirport);

    await declareAmnScheduledFlight({
      externalFlightId: flightNumber, flightNumber, operatingDate,
      originIata: originAirport.iata, destinationIata: destinationAirport.iata,
      originAirport, destinationAirport,
      scheduledDepartureUtc: departureAt.toISOString(), aircraftTypeCode: aircraft.aircraftType,
      registration: aircraft.registration, idempotencyKey: `schedule:${requestIdentity}`,
    });
    const allocation = await requestAmnPayload({
      externalFlightId: flightNumber,
      flightNumber,
      operatingDate,
      originIata: originAirport.iata,
      destinationIata: destinationAirport.iata,
      aircraftTypeCode: aircraft.aircraftType,
      registration: aircraft.registration,
      routeId: route.id,
      aircraftId: aircraft.id,
      idempotencyKey: `aoc:${requestIdentity}`,
      loadStage: "FINAL",
    });
    return NextResponse.json({ allocation, token: signAmnPayloadAllocation(allocation) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AMN Payload request failed." }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
}
