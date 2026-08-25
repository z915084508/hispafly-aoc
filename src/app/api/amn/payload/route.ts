import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { requestAmnPayload, signAmnPayloadAllocation } from "@/lib/amn/payload";

function fallbackFlightNumber(route: { id: string; callsign: string | null; routeCode: string | null }) {
  const explicit = route.callsign?.trim() || route.routeCode?.trim();
  if (explicit) return explicit.toUpperCase();
  const suffix = Number.parseInt(createHash("sha256").update(route.id).digest("hex").slice(0, 6), 16) % 10_000;
  return `HF${String(suffix).padStart(4, "0")}`;
}

export async function POST(request: Request) {
  try {
    await requirePilotSession();
    const body = await request.json() as { routeId?: string; aircraftId?: string; departureAt?: string; idempotencyKey?: string };
    const departureAt = new Date(String(body.departureAt ?? ""));
    if (!body.routeId || !body.aircraftId || !body.idempotencyKey || Number.isNaN(departureAt.getTime())) throw new Error("Select a route, aircraft and valid UTC departure first.");
    const [route, aircraft] = await Promise.all([
      prisma.route.findFirst({
        where: { id: body.routeId, active: true, operationalStatus: "ACTIVE" },
        include: { departureAirport: true, arrivalAirport: true },
      }),
      prisma.aircraft.findFirst({
        where: { id: body.aircraftId, archivedAt: null },
        include: { locationSnapshot: true },
      }),
    ]);
    if (!route?.departureAirport?.iata || !route.arrivalAirport?.iata) throw new Error("The route requires IATA airport codes before AMN can allocate traffic.");
    if (!aircraft?.registration || !aircraft.aircraftType) throw new Error("The aircraft type and registration must be configured before requesting AMN Payload.");
    if ((aircraft.locationSnapshot?.currentAirportId ?? aircraft.currentAirportId) !== route.departureAirportId) throw new Error("The selected aircraft is not at the route departure airport.");

    const nearbyStart = new Date(departureAt.getTime() - 60_000);
    const nearbyEnd = new Date(departureAt.getTime() + 60_000);
    const datedFlight = await prisma.flight.findFirst({
      where: {
        routeId: route.id,
        scheduledDeparture: { gte: nearbyStart, lte: nearbyEnd },
        status: { notIn: ["CANCELLED", "COMPLETED", "EXPIRED"] },
      },
      orderBy: { scheduledDeparture: "asc" },
    });

    // Flight identity belongs to the dated PROGRAMACION flight when one exists.
    // Route-level flightNumber is optional; ad-hoc/free dispatches receive a stable fallback identity.
    const flightNumber = datedFlight?.flightNumber?.trim()
      || route.flightNumber?.trim()
      || fallbackFlightNumber(route);
    const operatingDate = datedFlight
      ? datedFlight.operatingDate.toISOString().slice(0, 10)
      : departureAt.toISOString().slice(0, 10);
    const externalFlightId = datedFlight?.id ?? `adhoc:${route.id}:${departureAt.toISOString()}`;
    const requestIdentity = createHash("sha256")
      .update(`${body.idempotencyKey}|${externalFlightId}|${operatingDate}|${aircraft.registration}`)
      .digest("hex");

    const allocation = await requestAmnPayload({
      externalFlightId,
      flightNumber,
      operatingDate,
      originIata: route.departureAirport.iata.trim().toUpperCase(),
      destinationIata: route.arrivalAirport.iata.trim().toUpperCase(),
      aircraftTypeCode: aircraft.aircraftType,
      registration: aircraft.registration,
      routeId: route.id,
      sourceRouteId: route.id,
      scheduledDepartureUtc: departureAt.toISOString(),
      aircraftId: aircraft.id,
      idempotencyKey: `aoc:${requestIdentity}`,
      loadStage: "FINAL",
    });
    return NextResponse.json({ allocation, token: signAmnPayloadAllocation(allocation), externalFlightId }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AMN Payload request failed." }, {
      status: 422,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
