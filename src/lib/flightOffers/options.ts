import { prisma } from "@/lib/prisma";
import { isOperationsConfigured, operationsRequest } from "@/lib/vamsys/operations";

type Row = Record<string, unknown>;
const rec = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const str = (row: Row | null, ...keys: string[]) => {
  if (!row) return null;
  for (const key of keys) if (typeof row[key] === "string" || typeof row[key] === "number") return String(row[key]);
  return null;
};
const num = (row: Row | null, ...keys: string[]) => {
  const value = str(row, ...keys);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const durationMinutes = (row: Row | null, ...keys: string[]) => {
  const value = str(row, ...keys);
  if (!value) return null;
  if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value)) {
    const parts = value.split(":").map(Number);
    const [hours, minutes, seconds = 0] = parts;
    return Math.max(1, Math.round(hours * 60 + minutes + seconds / 60));
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.round(numeric)) : null;
};
const nested = (row: Row | null, key: string) => rec(row?.[key]);
const rows = (value: unknown) => {
  const root = rec(value);
  const data = root?.data ?? root?.routes ?? value;
  return Array.isArray(data) ? data.map(rec).filter(Boolean) as Row[] : [];
};
const cursor = (value: unknown) => {
  const root = rec(value), meta = nested(root, "meta"), links = nested(root, "links");
  return str(meta, "next_cursor", "nextCursor") ?? str(links, "next_cursor", "nextCursor");
};

let currentRoutesCache: { expiresAt: number; rows: Row[] } | null = null;
async function currentOperationsRoutes() {
  if (!isOperationsConfigured()) return [];
  if (currentRoutesCache && currentRoutesCache.expiresAt > Date.now()) return currentRoutesCache.rows;
  const result: Row[] = []; let next: string | null = null;
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ "page[size]": "100", sort: "id" });
    if (next) query.set("page[cursor]", next);
    const payload = await operationsRequest(`/routes?${query}`);
    result.push(...rows(payload));
    next = cursor(payload);
    if (!next) break;
  }
  currentRoutesCache = { expiresAt: Date.now() + 5 * 60_000, rows: result };
  return result;
}

export interface FlightOfferRouteOption {
  id: string;
  departure: string;
  arrival: string;
  flightNumber: string | null;
  callsign: string | null;
  altitude: number | null;
  userRoute: string | null;
  fleetIds: string[];
  durationMinutes: number | null;
}

export async function getFlightOfferOptions() {
  const [airports, fleets, aircraft, storedRoutes, pireps, liveRoutes] = await Promise.all([
    prisma.airport.findMany({ select: { icao: true, iata: true, name: true, rawData: true }, orderBy: { icao: "asc" } }),
    prisma.fleet.findMany({ select: { vamsysFleetId: true, name: true, rawData: true }, orderBy: { name: "asc" } }),
    prisma.aircraft.findMany({ select: { vamsysAircraftId: true, registration: true, aircraftType: true, fleetId: true, status: true }, orderBy: [{ aircraftType: "asc" }, { registration: "asc" }] }),
    prisma.route.findMany({ orderBy: [{ departure: "asc" }, { arrival: "asc" }, { flightNumber: "asc" }] }),
    prisma.pirep.findMany({ where: { source: "vamsys_operations" }, select: { rawData: true, departure: true, arrival: true, flightNumber: true, callsign: true }, orderBy: { flownAt: "desc" }, take: 2000 }),
    currentOperationsRoutes().catch((error) => { console.warn("[Flight offers] current Operations routes unavailable; using local cache.", error); return [] as Row[]; }),
  ]);

  const airportById = new Map<string, string>();
  for (const airport of airports) {
    const raw = rec(airport.rawData);
    const id = str(raw, "id", "airport_id", "airportId");
    if (id) airportById.set(id, airport.icao);
  }

  const routeMap = new Map<string, FlightOfferRouteOption>();
  for (const stored of storedRoutes) {
    const raw = rec(stored.rawData);
    routeMap.set(stored.vamsysRouteId, {
      id: stored.vamsysRouteId,
      departure: stored.departure ?? "",
      arrival: stored.arrival ?? "",
      flightNumber: stored.flightNumber,
      callsign: str(raw, "callsign"),
      altitude: num(raw, "altitude"),
      userRoute: str(raw, "route", "user_route"),
      fleetIds: Array.isArray(raw?.fleet_ids) ? raw.fleet_ids.map(String) : [],
      durationMinutes: durationMinutes(raw, "flight_length", "flightLength", "duration_minutes", "durationMinutes"),
    });
  }

  for (const pirep of pireps) {
    const root = rec(pirep.rawData);
    const attributes = rec(root?.attributes);
    const source = { ...(attributes ?? {}), ...(root ?? {}) };
    const booking = rec(source.booking);
    const route = rec(source.route) ?? rec(booking?.route);
    const id = str(route, "id") ?? str(source, "route_id") ?? str(booking, "route_id");
    if (!id) continue;
    const departureAirport = rec(source.departure_airport);
    const arrivalAirport = rec(source.arrival_airport);
    const existing = routeMap.get(id);
    const fleetIds = Array.isArray(route?.fleet_ids) ? route!.fleet_ids.map(String) : [];
    routeMap.set(id, {
      id,
      departure: str(departureAirport, "icao") ?? pirep.departure ?? existing?.departure ?? "",
      arrival: str(arrivalAirport, "icao") ?? pirep.arrival ?? existing?.arrival ?? "",
      flightNumber: str(route, "flight_number") ?? pirep.flightNumber ?? existing?.flightNumber ?? null,
      callsign: str(route, "callsign") ?? pirep.callsign ?? existing?.callsign ?? null,
      altitude: num(route, "altitude") ?? existing?.altitude ?? null,
      userRoute: str(route, "route", "user_route") ?? existing?.userRoute ?? null,
      fleetIds: fleetIds.length ? fleetIds : existing?.fleetIds ?? [],
      durationMinutes: durationMinutes(route, "flight_length", "flightLength", "duration_minutes", "durationMinutes") ?? existing?.durationMinutes ?? null,
    });
  }

  if (liveRoutes.length) {
    routeMap.clear();
    for (const live of liveRoutes) {
      const attributes = nested(live, "attributes");
      const route = attributes ? { ...live, ...attributes } : live;
      const id = str(route, "id", "route_id", "routeId");
      if (!id) continue;
      const departureObject = nested(route, "departure") ?? nested(route, "departure_airport");
      const arrivalObject = nested(route, "arrival") ?? nested(route, "arrival_airport");
      const departure = str(departureObject, "icao", "code") ?? airportById.get(str(route, "departure_id", "departureId") ?? "") ?? "";
      const arrival = str(arrivalObject, "icao", "code") ?? airportById.get(str(route, "arrival_id", "arrivalId") ?? "") ?? "";
      routeMap.set(id, {
        id,
        departure: departure.toUpperCase(),
        arrival: arrival.toUpperCase(),
        flightNumber: str(route, "flight_number", "flightNumber"),
        callsign: str(route, "callsign"),
        altitude: num(route, "altitude"),
        userRoute: str(route, "route", "user_route", "userRoute"),
        fleetIds: Array.isArray(route.fleet_ids) ? route.fleet_ids.map(String) : [],
        durationMinutes: durationMinutes(route, "flight_length", "flightLength", "duration_minutes", "durationMinutes"),
      });
    }
  }

  return {
    airports: airports.map((airport) => ({ icao: airport.icao, iata: airport.iata, name: airport.name })),
    routes: [...routeMap.values()].filter((route) => route.departure && route.arrival).sort((a, b) => `${a.departure}${a.arrival}${a.flightNumber}`.localeCompare(`${b.departure}${b.arrival}${b.flightNumber}`)),
    fleets: fleets.map((fleet) => {
      const raw = rec(fleet.rawData);
      return { id: fleet.vamsysFleetId, name: fleet.name, code: str(raw, "code", "icao"), passengers: num(raw, "max_pax", "passengers"), cargoKg: num(raw, "max_cargo", "cargo") };
    }),
    aircraft,
  };
}
