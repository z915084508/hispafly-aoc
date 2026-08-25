import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toAmnAirportMetadata } from "@/lib/amn/airport-metadata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RequestBody = {
  externalFlightId?: string;
  operatingDate?: string;
  originIata?: string;
  destinationIata?: string;
  sourceRouteId?: string | null;
  scheduledDepartureUtc?: string | null;
};

function authorized(request: Request) {
  const expected = process.env.AMN_API_KEY?.trim();
  const presented = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!expected || !presented) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(presented);
  return left.length === right.length && timingSafeEqual(left, right);
}

function aircraftTypeCode(input: {
  assignedAircraft?: { aircraftType: string | null } | null;
  fleet?: { type: string | null; iataType: string | null; code: string | null } | null;
}) {
  const candidates = [input.assignedAircraft?.aircraftType, input.fleet?.type, input.fleet?.iataType, input.fleet?.code];
  for (const candidate of candidates) {
    const raw = candidate?.trim().toUpperCase() ?? "";
    const compact = raw.replace(/[^A-Z0-9]/g, "");
    const direct = compact.match(/^(A3\d{2}|A2\d{2}|B7\d{2}|B3\d{2}|E\d{3}|CRJ\d|AT\d{2})/)?.[1];
    if (direct && /^[A-Z0-9]{2,4}$/.test(direct)) return direct;
    if (/^[A-Z0-9]{2,4}$/.test(compact)) return compact;
  }
  return null;
}

function dateRange(operatingDate: string) {
  const start = new Date(`${operatingDate}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: { code: "INVALID_AMN_CREDENTIAL", message: "AMN credential is not authorized." } }, { status: 401 });
  }

  try {
    const body = await request.json() as RequestBody;
    const externalFlightId = body.externalFlightId?.trim();
    const operatingDate = body.operatingDate?.trim();
    const originIata = body.originIata?.trim().toUpperCase();
    const destinationIata = body.destinationIata?.trim().toUpperCase();
    if (!externalFlightId || !operatingDate || !/^\d{4}-\d{2}-\d{2}$/.test(operatingDate) || !originIata || !destinationIata) {
      throw new Error("INVALID_FLIGHT_CONTEXT_REQUEST");
    }

    const isAdhoc = externalFlightId.startsWith("adhoc:");
    const target = isAdhoc ? null : await prisma.flight.findUnique({
      where: { id: externalFlightId },
      include: {
        route: true,
        departureAirport: true,
        arrivalAirport: true,
        fleet: true,
        assignedAircraft: true,
      },
    });

    if (!isAdhoc && !target) throw new Error("FLIGHT_NOT_FOUND");
    if (target && ["CANCELLED", "EXPIRED"].includes(target.status)) throw new Error("FLIGHT_NOT_AVAILABLE");
    if (target && target.status === "COMPLETED") throw new Error("FLIGHT_ALREADY_COMPLETED");

    const routeId = target?.routeId ?? body.sourceRouteId?.trim() ?? null;
    const route = routeId ? await prisma.route.findUnique({
      where: { id: routeId },
      include: { departureAirport: true, arrivalAirport: true, defaultFleet: true },
    }) : null;
    if (!route || !route.departureAirport || !route.arrivalAirport) throw new Error("ROUTE_NOT_FOUND");
    if (route.departureAirport.iata?.toUpperCase() !== originIata || route.arrivalAirport.iata?.toUpperCase() !== destinationIata) {
      throw new Error("ROUTE_MISMATCH");
    }

    const { start, end } = dateRange(operatingDate);
    const marketFlights = await prisma.flight.findMany({
      where: {
        scheduledDeparture: { gte: start, lt: end },
        departureAirportId: route.departureAirport.id,
        arrivalAirportId: route.arrivalAirport.id,
        status: { notIn: ["CANCELLED", "COMPLETED", "EXPIRED"] },
      },
      include: { fleet: true, assignedAircraft: true },
      orderBy: [{ scheduledDeparture: "asc" }, { id: "asc" }],
    });

    return NextResponse.json({
      source: "HISPAFLY_AOC",
      queriedAt: new Date().toISOString(),
      route: {
        routeId: route.id,
        routeCode: route.routeCode,
        flightNumber: route.flightNumber,
        originAirport: toAmnAirportMetadata(route.departureAirport),
        destinationAirport: toAmnAirportMetadata(route.arrivalAirport),
        defaultAircraftTypeCode: aircraftTypeCode({ fleet: route.defaultFleet }),
      },
      targetFlight: target ? {
        flightId: target.id,
        routeId: target.routeId,
        scheduleId: target.scheduleId,
        operatingDate: target.operatingDate.toISOString().slice(0, 10),
        flightNumber: target.flightNumber,
        callsign: target.callsign,
        status: target.status,
        scheduledDepartureUtc: target.scheduledDeparture.toISOString(),
        scheduledArrivalUtc: target.scheduledArrival.toISOString(),
        aircraftTypeCode: aircraftTypeCode(target),
        registration: target.assignedAircraft?.registration ?? null,
      } : {
        flightId: externalFlightId,
        routeId: route.id,
        scheduleId: null,
        operatingDate,
        flightNumber: route.flightNumber,
        callsign: route.callsign,
        status: "ADHOC",
        scheduledDepartureUtc: body.scheduledDepartureUtc ?? null,
        scheduledArrivalUtc: null,
        aircraftTypeCode: aircraftTypeCode({ fleet: route.defaultFleet }),
        registration: null,
      },
      marketFlights: marketFlights.map((flight) => ({
        flightId: flight.id,
        routeId: flight.routeId,
        scheduleId: flight.scheduleId,
        operatingDate: flight.operatingDate.toISOString().slice(0, 10),
        flightNumber: flight.flightNumber,
        status: flight.status,
        scheduledDepartureUtc: flight.scheduledDeparture.toISOString(),
        aircraftTypeCode: aircraftTypeCode(flight),
        registration: flight.assignedAircraft?.registration ?? null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FLIGHT_CONTEXT_FAILED";
    const status = code === "FLIGHT_NOT_FOUND" || code === "ROUTE_NOT_FOUND" ? 404 : ["FLIGHT_NOT_AVAILABLE", "FLIGHT_ALREADY_COMPLETED", "ROUTE_MISMATCH"].includes(code) ? 409 : 422;
    return NextResponse.json({ error: { code, message: code } }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
