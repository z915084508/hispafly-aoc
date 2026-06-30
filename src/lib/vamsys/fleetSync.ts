import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { operationsRequest } from "./operations";

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_SYNC_PAGES = 10;

type Row = Record<string, unknown>;

const rec = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const str = (row: Row | null | undefined, ...keys: string[]) => {
  if (!row) return null;
  for (const key of keys) if (typeof row[key] === "string" || typeof row[key] === "number") return String(row[key]);
  return null;
};
const num = (row: Row | null | undefined, ...keys: string[]) => {
  const value = str(row, ...keys);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const nested = (row: Row | null | undefined, key: string) => rec(row?.[key]);
const list = (value: unknown, resource: string) => {
  const root = rec(value);
  const singular = resource.endsWith("s") ? resource.slice(0, -1) : resource;
  const data = root?.data ?? root?.[resource] ?? root?.[singular] ?? root?.items ?? root?.results ?? value;
  return Array.isArray(data) ? data.map(rec).filter(Boolean) as Row[] : [];
};
const nextCursor = (value: unknown) => {
  const root = rec(value);
  const meta = nested(root, "meta");
  const links = nested(root, "links");
  return str(meta, "next_cursor", "nextCursor") ?? str(links, "next_cursor", "nextCursor");
};

function configuredPaths(name: string, fallbacks: string[]) {
  const configured = process.env[name]?.trim();
  return configured ? [configured] : fallbacks;
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
  const records: Row[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_SYNC_PAGES; page++) {
    const query = new URLSearchParams({ "page[size]": "100", sort: "id" });
    if (cursor) query.set("page[cursor]", cursor);
    const separator = path.includes("?") ? "&" : "?";
    const requestPath = `${path}${separator}${query}`;
    const body = await requestWithTimeout(requestPath, resource);
    const rows = list(body, resource);
    records.push(...rows);
    cursor = nextCursor(body);
    console.info(`[vAMSYS Operations ${resource}] path=${path} page=${page + 1} pageRecords=${rows.length} total=${records.length} next=${cursor ?? "none"}`);
    if (!cursor) return records;
  }
  throw new Error(`Operations ${resource} pagination exceeded the ${MAX_SYNC_PAGES} page safety limit.`);
}

async function fetchAllFromFirstAvailable(paths: string[], resource: string) {
  const errors: string[] = [];
  for (const path of paths) {
    try {
      return { path, rows: await fetchAll(path, resource), errors };
    } catch (error) {
      errors.push(`${path}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  throw new Error(errors.join(" | "));
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

function fleetId(row: Row) {
  return str(row, "fleet_id", "fleetId", "id", "uuid", "identifier");
}

function aircraftId(row: Row) {
  return str(row, "aircraft_id", "aircraftId", "id", "uuid", "identifier", "registration", "reg", "tail", "tail_number", "tailNumber");
}

function aircraftType(row: Row) {
  const fleet = nested(row, "fleet");
  return str(row, "aircraft_type", "aircraftType", "icao", "icao_type", "icaoType", "type_code", "typeCode", "type")
    ?? str(fleet, "code", "icao", "icao_type", "name")
    ?? str(row, "code", "name");
}

function airportIcao(row: Row) {
  return icao(str(row, "icao", "icao_code", "icaoCode", "ident", "code", "id"));
}

function countryName(row: Row) {
  const country = nested(row, "country");
  return str(row, "country", "country_name", "countryName") ?? str(country, "name", "iso2");
}

function rounded(row: Row, ...keys: string[]) {
  const value = num(row, ...keys);
  return value === null ? null : Math.round(value);
}

async function fetchAircraftForFleets(fleets: Row[]) {
  const aircraft: Row[] = [];
  const errors: string[] = [];
  for (const fleet of fleets) {
    const id = fleetId(fleet);
    if (!id) continue;
    try {
      const rows = await fetchAll(`/fleet/${encodeURIComponent(id)}/aircraft`, "aircraft");
      aircraft.push(...rows.map((row) => ({ ...row, fleet_id: str(row, "fleet_id", "fleetId") ?? id, fleet: nested(row, "fleet") ?? fleet })));
    } catch (error) {
      errors.push(`/fleet/${id}/aircraft: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return { aircraft, errors };
}

async function upsertAircraft(row: Row) {
  const id = aircraftId(row);
  if (!id) throw new Error("Aircraft without id.");
  const fleet = nested(row, "fleet");
  const existing = await prisma.aircraft.findUnique({ where: { vamsysAircraftId: id }, select: { id: true } });
  const data = {
    registration: str(row, "registration", "reg", "tail", "tail_number", "tailNumber"),
    aircraftType: aircraftType(row),
    fleetId: str(row, "fleet_id", "fleetId") ?? (fleet ? fleetId(fleet) : null),
    fleetName: str(fleet, "name", "title", "code", "icao"),
    status: str(row, "status", "state", "aircraft_status", "aircraftStatus"),
    seatCapacity: rounded(row, "seat_capacity", "seatCapacity", "seats", "pax", "passengers", "max_pax", "maxPax"),
    cargoCapacityKg: rounded(row, "cargo_capacity", "cargoCapacity", "cargo_capacity_kg", "cargoCapacityKg", "cargo", "max_cargo", "maxCargo"),
    mtowKg: rounded(row, "mtow", "mtow_kg", "mtowKg", "maximum_takeoff_weight", "maximumTakeoffWeight"),
    rawData: row as Prisma.InputJsonValue,
  };
  await prisma.aircraft.upsert({ where: { vamsysAircraftId: id }, update: data, create: { vamsysAircraftId: id, ...data } });
  return existing ? "updated" : "imported";
}

async function upsertAirport(row: Row) {
  const code = airportIcao(row);
  if (!code) throw new Error("Airport without ICAO.");
  const existing = await prisma.airport.findUnique({ where: { icao: code }, select: { id: true } });
  const data = {
    iata: str(row, "iata", "iata_code", "iataCode"),
    name: str(row, "name", "airport_name", "airportName"),
    city: str(row, "city", "municipality"),
    country: countryName(row),
    region: str(row, "region") ?? regionFromIcao(code),
    latitude: num(row, "latitude", "lat"),
    longitude: num(row, "longitude", "lon", "lng"),
    source: "vamsys_operations",
    rawData: row as Prisma.InputJsonValue,
  };
  await prisma.airport.upsert({ where: { icao: code }, update: data, create: { icao: code, ...data } });
  return existing ? "updated" : "imported";
}

export async function syncOperationsFleetData(staffUserId?: string) {
  const result = { fleetsImported: 0, fleetsUpdated: 0, aircraftImported: 0, aircraftUpdated: 0, airportsImported: 0, airportsUpdated: 0, skipped: 0, errors: [] as string[] };
  const fleetPaths = configuredPaths("VAMSYS_OPERATIONS_FLEETS_PATH", ["/fleet", "/fleets"]);
  const aircraftPaths = configuredPaths("VAMSYS_OPERATIONS_AIRCRAFT_PATH", []);
  const airportPaths = configuredPaths("VAMSYS_OPERATIONS_AIRPORTS_PATH", ["/airports"]);
  let syncedFleets: Row[] = [];

  try {
    const { path, rows: fleets, errors } = await fetchAllFromFirstAvailable(fleetPaths, "fleet");
    syncedFleets = fleets;
    if (errors.length) console.warn(`[vAMSYS Operations fleet] fallback used ${path}; previous errors: ${errors.join(" | ")}`);
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
    result.errors.push(`Fleet endpoints ${fleetPaths.join(", ")}: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const aircraft = aircraftPaths.length
      ? (await fetchAllFromFirstAvailable(aircraftPaths, "aircraft")).rows
      : (await fetchAircraftForFleets(syncedFleets)).aircraft;
    for (const row of aircraft) {
      try {
        const status = await upsertAircraft(row);
        if (status === "updated") result.aircraftUpdated++; else result.aircraftImported++;
      } catch (error) {
        result.skipped++;
        result.errors.push(error instanceof Error ? error.message : "Unknown aircraft sync error.");
      }
    }
  } catch (error) {
    result.errors.push(`Aircraft sync: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const { path, rows: airports, errors } = await fetchAllFromFirstAvailable(airportPaths, "airports");
    if (errors.length) console.warn(`[vAMSYS Operations airports] fallback used ${path}; previous errors: ${errors.join(" | ")}`);
    for (const row of airports) {
      try {
        const status = await upsertAirport(row);
        if (status === "updated") result.airportsUpdated++; else result.airportsImported++;
      } catch (error) {
        result.skipped++;
        result.errors.push(error instanceof Error ? error.message : "Unknown airport sync error.");
      }
    }
  } catch (error) {
    result.errors.push(`Airport endpoints ${airportPaths.join(", ")}: ${error instanceof Error ? error.message : "unknown error"}`);
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
