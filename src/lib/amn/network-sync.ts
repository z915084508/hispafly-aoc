import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  cancelAmnScheduledFlight,
  declareAmnScheduledFlight,
  isAmnConfigured,
  syncAmnNetworkRoute,
  syncAmnOperationalAirport,
  type AmnOperationalAirportMetadata,
} from "./payload";

const DAY_MS = 86_400_000;
const SYNC_CONCURRENCY = 8;

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function stableKey(prefix: string, parts: Array<string | number | null | undefined>) {
  const digest = createHash("sha256").update(parts.map((value) => value ?? "").join("|")).digest("hex");
  return `${prefix}:${digest}`;
}

async function forEachConcurrent<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += concurrency) {
    await Promise.all(items.slice(index, index + concurrency).map(worker));
  }
}

export function toAmnAirportMetadata(airport: {
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
  if (!airport.iata) throw new Error("AIRPORT_IATA_REQUIRED");
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

function aircraftTypeCode(input: {
  assignedAircraft?: { aircraftType: string | null } | null;
  fleet?: { type: string | null; iataType: string | null; code: string | null } | null;
}) {
  const candidates = [input.assignedAircraft?.aircraftType, input.fleet?.type, input.fleet?.iataType, input.fleet?.code];
  for (const candidate of candidates) {
    const raw = candidate?.trim().toUpperCase() ?? "";
    const compact = raw.replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{2,4}$/.test(compact)) return compact;
    const embedded = raw.match(/\b([A-Z][0-9A-Z]{2,3})\b/)?.[1] ?? null;
    if (embedded && /^[A-Z0-9]{2,4}$/.test(embedded)) return embedded;
  }
  return null;
}

export type AmnNetworkSyncError = {
  entity: "AIRPORT" | "ROUTE" | "FLIGHT" | "CANCELLATION";
  id: string;
  message: string;
};

export type AmnNetworkSyncResult = {
  from: string;
  to: string;
  airports: { found: number; synced: number; skipped: number };
  routes: { found: number; synced: number; skipped: number };
  flights: { found: number; synced: number; cancelled: number; skipped: number };
  errors: AmnNetworkSyncError[];
};

export async function syncOneFlightToAmn(flightId: string) {
  if (!isAmnConfigured()) throw new Error("AMN_NOT_CONFIGURED");
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      route: true,
      departureAirport: true,
      arrivalAirport: true,
      fleet: true,
      assignedAircraft: true,
    },
  });
  if (!flight) throw new Error("FLIGHT_NOT_FOUND");
  const operatingDate = dateOnly(flight.operatingDate);
  if (flight.status === "CANCELLED") {
    return cancelAmnScheduledFlight({
      externalFlightId: flight.id,
      operatingDate,
      reason: flight.notes?.slice(-400) || "Cancelled in HISPAFLY AOC",
      idempotencyKey: stableKey("flight-cancel", [flight.id, flight.updatedAt.toISOString(), flight.status]),
    });
  }
  if (!flight.departureAirport || !flight.arrivalAirport) throw new Error("FLIGHT_AIRPORTS_REQUIRED");
  const originAirport = toAmnAirportMetadata(flight.departureAirport);
  const destinationAirport = toAmnAirportMetadata(flight.arrivalAirport);
  const typeCode = aircraftTypeCode(flight);
  if (!typeCode) throw new Error("FLIGHT_AIRCRAFT_TYPE_REQUIRED");
  return declareAmnScheduledFlight({
    externalFlightId: flight.id,
    flightNumber: flight.flightNumber,
    operatingDate,
    originIata: originAirport.iata,
    destinationIata: destinationAirport.iata,
    originAirport,
    destinationAirport,
    scheduledDepartureUtc: flight.scheduledDeparture.toISOString(),
    aircraftTypeCode: typeCode,
    registration: flight.assignedAircraft?.registration ?? null,
    sourceRouteId: flight.routeId,
    sourceScheduleId: flight.scheduleId,
    idempotencyKey: stableKey("flight-sync", [flight.id, flight.updatedAt.toISOString(), typeCode, flight.assignedAircraft?.registration]),
  });
}

export async function syncHispaflyNetworkToAmn(input?: { from?: Date; to?: Date }): Promise<AmnNetworkSyncResult> {
  if (!isAmnConfigured()) throw new Error("AMN_NOT_CONFIGURED");
  const fromDate = input?.from ?? new Date();
  const toDate = input?.to ?? new Date(fromDate.getTime() + 30 * DAY_MS);
  const from = dateOnly(fromDate);
  const to = dateOnly(toDate);
  const result: AmnNetworkSyncResult = {
    from,
    to,
    airports: { found: 0, synced: 0, skipped: 0 },
    routes: { found: 0, synced: 0, skipped: 0 },
    flights: { found: 0, synced: 0, cancelled: 0, skipped: 0 },
    errors: [],
  };

  const airports = await prisma.airport.findMany({
    where: { status: "ACTIVE" },
    orderBy: { icao: "asc" },
  });
  result.airports.found = airports.length;
  await forEachConcurrent(airports, SYNC_CONCURRENCY, async (airport) => {
    if (!airport.iata) {
      result.airports.skipped += 1;
      result.errors.push({ entity: "AIRPORT", id: airport.id, message: "AIRPORT_IATA_REQUIRED" });
      return;
    }
    try {
      const metadata = toAmnAirportMetadata(airport);
      await syncAmnOperationalAirport(metadata, stableKey("airport-sync", [airport.id, airport.updatedAt.toISOString()]));
      result.airports.synced += 1;
    } catch (error) {
      result.airports.skipped += 1;
      result.errors.push({ entity: "AIRPORT", id: airport.id, message: error instanceof Error ? error.message : "AIRPORT_SYNC_FAILED" });
    }
  });

  const routes = await prisma.route.findMany({
    where: { active: true, operationalStatus: "ACTIVE", archivedAt: null },
    include: { departureAirport: true, arrivalAirport: true, defaultFleet: true },
    orderBy: { id: "asc" },
  });
  result.routes.found = routes.length;
  await forEachConcurrent(routes, SYNC_CONCURRENCY, async (route) => {
    const originIata = route.departureAirport?.iata?.trim().toUpperCase();
    const destinationIata = route.arrivalAirport?.iata?.trim().toUpperCase();
    if (!originIata || !destinationIata) {
      result.routes.skipped += 1;
      result.errors.push({ entity: "ROUTE", id: route.id, message: "ROUTE_IATA_REQUIRED" });
      return;
    }
    try {
      await syncAmnNetworkRoute({
        externalRouteId: route.id,
        routeCode: route.routeCode,
        flightNumber: route.flightNumber,
        originIata,
        destinationIata,
        status: "ACTIVE",
        effectiveFrom: route.effectiveFrom ? dateOnly(route.effectiveFrom) : null,
        effectiveUntil: route.effectiveUntil ? dateOnly(route.effectiveUntil) : null,
        defaultAircraftTypeCode: aircraftTypeCode({ fleet: route.defaultFleet }),
        idempotencyKey: stableKey("route-sync", [route.id, route.updatedAt.toISOString(), route.operationalStatus]),
      });
      result.routes.synced += 1;
    } catch (error) {
      result.routes.skipped += 1;
      result.errors.push({ entity: "ROUTE", id: route.id, message: error instanceof Error ? error.message : "ROUTE_SYNC_FAILED" });
    }
  });

  const flights = await prisma.flight.findMany({
    where: {
      scheduledDeparture: { gte: fromDate, lte: toDate },
      status: { notIn: ["COMPLETED", "EXPIRED"] },
    },
    include: {
      route: true,
      departureAirport: true,
      arrivalAirport: true,
      fleet: true,
      assignedAircraft: true,
    },
    orderBy: [{ scheduledDeparture: "asc" }, { id: "asc" }],
  });
  result.flights.found = flights.length;
  await forEachConcurrent(flights, SYNC_CONCURRENCY, async (flight) => {
    try {
      if (flight.status === "CANCELLED") {
        try {
          await cancelAmnScheduledFlight({
            externalFlightId: flight.id,
            operatingDate: dateOnly(flight.operatingDate),
            reason: flight.notes?.slice(-400) || "Cancelled in HISPAFLY AOC",
            idempotencyKey: stableKey("flight-cancel", [flight.id, flight.updatedAt.toISOString(), flight.status]),
          });
          result.flights.cancelled += 1;
        } catch (error) {
          if (error instanceof Error && error.message.includes("SCHEDULED_FLIGHT_NOT_FOUND")) result.flights.skipped += 1;
          else throw error;
        }
        return;
      }
      if (!flight.departureAirport || !flight.arrivalAirport) throw new Error("FLIGHT_AIRPORTS_REQUIRED");
      const typeCode = aircraftTypeCode(flight);
      if (!typeCode) throw new Error("FLIGHT_AIRCRAFT_TYPE_REQUIRED");
      const originAirport = toAmnAirportMetadata(flight.departureAirport);
      const destinationAirport = toAmnAirportMetadata(flight.arrivalAirport);
      await declareAmnScheduledFlight({
        externalFlightId: flight.id,
        flightNumber: flight.flightNumber,
        operatingDate: dateOnly(flight.operatingDate),
        originIata: originAirport.iata,
        destinationIata: destinationAirport.iata,
        originAirport,
        destinationAirport,
        scheduledDepartureUtc: flight.scheduledDeparture.toISOString(),
        aircraftTypeCode: typeCode,
        registration: flight.assignedAircraft?.registration ?? null,
        sourceRouteId: flight.routeId,
        sourceScheduleId: flight.scheduleId,
        idempotencyKey: stableKey("flight-sync", [flight.id, flight.updatedAt.toISOString(), typeCode, flight.assignedAircraft?.registration]),
      });
      result.flights.synced += 1;
    } catch (error) {
      result.flights.skipped += 1;
      result.errors.push({ entity: flight.status === "CANCELLED" ? "CANCELLATION" : "FLIGHT", id: flight.id, message: error instanceof Error ? error.message : "FLIGHT_SYNC_FAILED" });
    }
  });

  return result;
}
