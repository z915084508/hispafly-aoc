import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { operationsRequest } from "./operations";

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_SYNC_PAGES = 10;

const rec = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const str = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) if (typeof r[k] === "string" || typeof r[k] === "number") return String(r[k]); return null; };
const num = (r: Record<string, unknown>, ...keys: string[]) => { const value = str(r, ...keys); if (value === null) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const nested = (r: Record<string, unknown>, key: string) => rec(r[key]);
const list = (v: unknown, resource: string) => {
  const root = rec(v);
  const data = root?.data ?? root?.[resource] ?? root?.[`${resource}s`] ?? root?.items ?? v;
  return Array.isArray(data) ? data.map(rec).filter(Boolean) as Record<string, unknown>[] : [];
};
const nextCursor = (v: unknown) => {
  const root = rec(v);
  const meta = rec(root?.meta);
  const links = rec(root?.links);
  return str(meta ?? {}, "next_cursor", "nextCursor") ?? str(links ?? {}, "next_cursor", "nextCursor");
};

function configuredPath(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

async function requestWithTimeout(path: string, resource: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${resource} endpoint no respondió en ${REQUEST_TIMEOUT_MS / 1000}s (${path}).`)), REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operationsRequest(path), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchAll(path: string, resource: string) {
  const records: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_SYNC_PAGES; page++) {
    const query = new URLSearchParams({ "page[size]": "100", sort: "id" });
    if (cursor) query.set("page[cursor]", cursor);
    const separator = path.includes("?") ? "&" : "?";
    const requestPath = `${path}${separator}${query}`;
    const body = await requestWithTimeout(requestPath, resource);
    records.push(...list(body, resource));
    cursor = nextCursor(body);
    console.info(`[vAMSYS Operations ${resource}] page=${page + 1} records=${records.length} next=${cursor ?? "none"}`);
    if (!cursor) return records;
  }
  throw new Error(`Operations ${resource} pagination exceeded the ${MAX_SYNC_PAGES} page safety limit.`);
}

function icao(value: string | null | undefined) {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z0-9]{4}$/.test(code) ? code : null;
}

function regionFromIcao(value: string | null | undefined) {
  const code = icao(value);
  if (!code) return "GLOBAL";
  if (/^(E|L|U)/.test(code)) return "EUROPE";
  if (/^(K|C|P)/.test(code)) return "NORTH_AMERICA";
  if (/^O/.test(code)) return "MIDDLE_EAST";
  if (/^(R|V|W|Y|Z)/.test(code)) return "ASIA";
  return "GLOBAL";
}

function fleetId(row: Record<string, unknown>) {
  return str(row, "fleet_id", "fleetId", "id", "uuid", "identifier");
}

function aircraftId(row: Record<string, unknown>) {
  return str(row, "aircraft_id", "aircraftId", "id", "uuid", "identifier");
}

function aircraftType(row: Record<string, unknown>) {
  const fleet = nested(row, "fleet");
  return str(row, "icao", "icao_type", "icaoType", "type_code", "typeCode", "aircraft_type", "aircraftType", "type", "code", "name")
    ?? (fleet ? str(fleet, "icao", "icao_type", "code", "name") : null);
}

function airportIcao(row: Record<string, unknown>) {
  return icao(str(row, "icao", "icao_code", "icaoCode", "ident", "code", "id"));
}

export async function syncOperationsFleetData(staffUserId?: string) {
  const result = { fleetsImported: 0, fleetsUpdated: 0, aircraftImported: 0, aircraftUpdated: 0, airportsImported: 0, airportsUpdated: 0, skipped: 0, errors: [] as string[] };
  const fleetPath = configuredPath("VAMSYS_OPERATIONS_FLEETS_PATH", "/fleets");
  const aircraftPath = configuredPath("VAMSYS_OPERATIONS_AIRCRAFT_PATH", "/aircraft");
  const airportPath = configuredPath("VAMSYS_OPERATIONS_AIRPORTS_PATH", "/airports");

  try {
    const fleets = await fetchAll(fleetPath, "fleets");
    for (const row of fleets) {
      try {
        const id = fleetId(row);
        if (!id) throw new Error("Fleet without id.");
        const existing = await prisma.fleet.findUnique({ where: { vamsysFleetId: id }, select: { id: true } });
        await prisma.fleet.upsert({
          where: { vamsysFleetId: id },
          update: { name: str(row, "name", "title", "code", "icao"), rawData: row as Prisma.InputJsonValue },
          create: { vamsysFleetId: id, name: str(row, "name", "title", "code", "icao"), rawData: row as Prisma.InputJsonValue },
        });
        if (existing) result.fleetsUpdated++; else result.fleetsImported++;
      } catch (error) {
        result.skipped++;
        result.errors.push(error instanceof Error ? error.message : "Unknown fleet sync error.");
      }
    }
  } catch (error) {
    result.errors.push(`Fleet endpoint ${fleetPath}: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const aircraft = await fetchAll(aircraftPath, "aircraft");
    for (const row of aircraft) {
      try {
        const id = aircraftId(row);
        if (!id) throw new Error("Aircraft without id.");
        const fleet = nested(row, "fleet");
        const existing = await prisma.aircraft.findUnique({ where: { vamsysAircraftId: id }, select: { id: true } });
        await prisma.aircraft.upsert({
          where: { vamsysAircraftId: id },
          update: {
            registration: str(row, "registration", "reg", "tail", "tail_number", "tailNumber"),
            aircraftType: aircraftType(row),
            fleetId: str(row, "fleet_id", "fleetId") ?? (fleet ? fleetId(fleet) : null),
            fleetName: fleet ? str(fleet, "name", "title", "code", "icao") : null,
            status: str(row, "status", "state", "aircraft_status", "aircraftStatus"),
            seatCapacity: num(row, "seat_capacity", "seatCapacity", "seats", "pax", "passenger_capacity", "passengerCapacity") === null ? null : Math.round(num(row, "seat_capacity", "seatCapacity", "seats", "pax", "passenger_capacity", "passengerCapacity")!),
            cargoCapacityKg: num(row, "cargo_capacity", "cargoCapacity", "cargo_capacity_kg", "cargoCapacityKg") === null ? null : Math.round(num(row, "cargo_capacity", "cargoCapacity", "cargo_capacity_kg", "cargoCapacityKg")!),
            mtowKg: num(row, "mtow", "mtow_kg", "mtowKg", "maximum_takeoff_weight", "maximumTakeoffWeight") === null ? null : Math.round(num(row, "mtow", "mtow_kg", "mtowKg", "maximum_takeoff_weight", "maximumTakeoffWeight")!),
            rawData: row as Prisma.InputJsonValue,
          },
          create: {
            vamsysAircraftId: id,
            registration: str(row, "registration", "reg", "tail", "tail_number", "tailNumber"),
            aircraftType: aircraftType(row),
            fleetId: str(row, "fleet_id", "fleetId") ?? (fleet ? fleetId(fleet) : null),
            fleetName: fleet ? str(fleet, "name", "title", "code", "icao") : null,
            status: str(row, "status", "state", "aircraft_status", "aircraftStatus"),
            seatCapacity: num(row, "seat_capacity", "seatCapacity", "seats", "pax", "passenger_capacity", "passengerCapacity") === null ? null : Math.round(num(row, "seat_capacity", "seatCapacity", "seats", "pax", "passenger_capacity", "passengerCapacity")!),
            cargoCapacityKg: num(row, "cargo_capacity", "cargoCapacity", "cargo_capacity_kg", "cargoCapacityKg") === null ? null : Math.round(num(row, "cargo_capacity", "cargoCapacity", "cargo_capacity_kg", "cargoCapacityKg")!),
            mtowKg: num(row, "mtow", "mtow_kg", "mtowKg", "maximum_takeoff_weight", "maximumTakeoffWeight") === null ? null : Math.round(num(row, "mtow", "mtow_kg", "mtowKg", "maximum_takeoff_weight", "maximumTakeoffWeight")!),
            rawData: row as Prisma.InputJsonValue,
          },
        });
        if (existing) result.aircraftUpdated++; else result.aircraftImported++;
      } catch (error) {
        result.skipped++;
        result.errors.push(error instanceof Error ? error.message : "Unknown aircraft sync error.");
      }
    }
  } catch (error) {
    result.errors.push(`Aircraft endpoint ${aircraftPath}: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const airports = await fetchAll(airportPath, "airports");
    for (const row of airports) {
      try {
        const code = airportIcao(row);
        if (!code) throw new Error("Airport without ICAO.");
        const existing = await prisma.airport.findUnique({ where: { icao: code }, select: { id: true } });
        await prisma.airport.upsert({
          where: { icao: code },
          update: {
            iata: str(row, "iata", "iata_code", "iataCode"),
            name: str(row, "name", "airport_name", "airportName"),
            city: str(row, "city", "municipality"),
            country: str(row, "country", "country_name", "countryName"),
            region: str(row, "region") ?? regionFromIcao(code),
            latitude: num(row, "latitude", "lat"),
            longitude: num(row, "longitude", "lon", "lng"),
            source: "vamsys_operations",
            rawData: row as Prisma.InputJsonValue,
          },
          create: {
            icao: code,
            iata: str(row, "iata", "iata_code", "iataCode"),
            name: str(row, "name", "airport_name", "airportName"),
            city: str(row, "city", "municipality"),
            country: str(row, "country", "country_name", "countryName"),
            region: str(row, "region") ?? regionFromIcao(code),
            latitude: num(row, "latitude", "lat"),
            longitude: num(row, "longitude", "lon", "lng"),
            source: "vamsys_operations",
            rawData: row as Prisma.InputJsonValue,
          },
        });
        if (existing) result.airportsUpdated++; else result.airportsImported++;
      } catch (error) {
        result.skipped++;
        result.errors.push(error instanceof Error ? error.message : "Unknown airport sync error.");
      }
    }
  } catch (error) {
    result.errors.push(`Airport endpoint ${airportPath}: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  await prisma.operationsApiState.upsert({
    where: { id: "vamsys" },
    update: { status: result.errors.length ? "degraded" : "healthy", lastSuccessAt: new Date(), lastAirportSyncAt: new Date(), lastError: result.errors[0]?.slice(0, 180) ?? null },
    create: { id: "vamsys", status: result.errors.length ? "degraded" : "healthy", lastSuccessAt: new Date(), lastAirportSyncAt: new Date(), lastError: result.errors[0]?.slice(0, 180) },
  });
  await writeAuditLogSafely({
    staffUserId,
    action: "VAMSYS_OPERATIONS_FLEET_SYNCED",
    entityType: "Aircraft",
    message: `Operations sync: ${result.fleetsImported} fleets imported, ${result.fleetsUpdated} fleets updated, ${result.aircraftImported} aircraft imported, ${result.aircraftUpdated} aircraft updated, ${result.airportsImported} airports imported, ${result.airportsUpdated} airports updated.`,
    metadata: {
      fleetsImported: result.fleetsImported,
      fleetsUpdated: result.fleetsUpdated,
      aircraftImported: result.aircraftImported,
      aircraftUpdated: result.aircraftUpdated,
      airportsImported: result.airportsImported,
      airportsUpdated: result.airportsUpdated,
      skipped: result.skipped,
      errors: result.errors.length,
      firstError: result.errors[0]?.slice(0, 180) ?? null,
    },
  });
  return result;
}
