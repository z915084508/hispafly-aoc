import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import { parseVamsysRouteCsv } from "./legacy-route-csv-parser";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2_000;

const integer = (value?: string) => value && /^\d+$/.test(value.trim()) ? Number(value) : null;
const duration = (value?: string) => { const match = value?.match(/^(\d+):(\d{2})$/); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };
const date = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
const actorId = (actor: StaffIdentity) => actor.id === "development-staff" ? null : actor.id;

export type LegacyRouteCsvResult = { rows: number; create: number; update: number; duplicateFlightNumbers: number; duplicateCallsigns: number; missingAirports: string[]; missingFleets: string[]; imported: boolean };

export async function importLegacyRouteCsv(file: File, actor: StaffIdentity, preview: boolean): Promise<LegacyRouteCsvResult> {
  if (!file.size || file.size > MAX_BYTES) throw new Error("Choose a non-empty vAMSYS Route CSV smaller than 5 MB.");
  const records = parseVamsysRouteCsv(await file.text());
  if (!records.length || records.length > MAX_ROWS) throw new Error(`CSV must contain between 1 and ${MAX_ROWS} routes.`);
  for (const field of ["ID", "Departure Airport (ICAO/IATA)", "Arrival Airport (ICAO/IATA)", "Flight Number", "Callsign", "Fleet IDs"]) if (!(field in records[0])) throw new Error(`Missing required vAMSYS column: ${field}.`);
  const ids = records.map((r) => r.ID.trim());
  if (ids.some((id) => !/^\d+$/.test(id)) || new Set(ids).size !== ids.length) throw new Error("Every vAMSYS Route ID must be a unique number.");

  const [airports, fleets, existing] = await Promise.all([
    prisma.airport.findMany({ select: { id: true, icao: true } }),
    prisma.fleet.findMany({ select: { id: true, vamsysFleetId: true } }),
    prisma.route.findMany({ where: { vamsysRouteId: { in: ids } }, select: { vamsysRouteId: true } }),
  ]);
  const airportByIcao = new Map(airports.map((a) => [a.icao, a.id]));
  const fleetByExternal = new Map(fleets.filter((f) => f.vamsysFleetId).map((f) => [f.vamsysFleetId!, f.id]));
  const airportCodes = new Set(records.flatMap((r) => [r["Departure Airport (ICAO/IATA)"].trim(), r["Arrival Airport (ICAO/IATA)"].trim()]));
  const fleetIds = new Set(records.flatMap((r) => r["Fleet IDs"].split(",").map((id) => id.trim()).filter(Boolean)));
  const missingAirports = [...airportCodes].filter((code) => !airportByIcao.has(code)).sort();
  const missingFleets = [...fleetIds].filter((id) => !fleetByExternal.has(id)).sort();
  const duplicates = (field: string) => { const counts = new Map<string, number>(); for (const row of records) { const value = row[field]?.trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); } return [...counts.values()].filter((count) => count > 1).length; };
  const known = new Set(existing.map((r) => r.vamsysRouteId));
  const result: LegacyRouteCsvResult = { rows: records.length, create: ids.filter((id) => !known.has(id)).length, update: ids.filter((id) => known.has(id)).length, duplicateFlightNumbers: duplicates("Flight Number"), duplicateCallsigns: duplicates("Callsign"), missingAirports, missingFleets, imported: !preview };
  if (preview) return result;
  if (missingAirports.length || missingFleets.length) throw new Error(`CSV references missing records: ${missingAirports.length} Airport(s), ${missingFleets.length} Fleet(s). Run Preview for details.`);

  for (let offset = 0; offset < records.length; offset += 100) await prisma.$transaction(async (tx) => {
    for (const row of records.slice(offset, offset + 100)) {
      const departure = row["Departure Airport (ICAO/IATA)"].trim(), arrival = row["Arrival Airport (ICAO/IATA)"].trim();
      const rawData = row as Prisma.InputJsonValue;
      const route = await tx.route.upsert({ where: { vamsysRouteId: row.ID.trim() }, update: {
        departure, arrival, departureAirportId: airportByIcao.get(departure), arrivalAirportId: airportByIcao.get(arrival), flightNumber: row["Flight Number"].trim() || null, callsign: row.Callsign.trim() || null, route: row.Routing.trim() || null, scheduledDurationMinutes: duration(row["Flight Length (HH:MM)"]), distanceNm: integer(row["Flight Distance (NM)"]), cruiseAltitude: integer(row.Altitude), costIndex: integer(row["Cost Index"]), effectiveFrom: date(row["Start Date"]), effectiveUntil: date(row["End Date"]), operationalStatus: row["Is Hidden"].toUpperCase() === "TRUE" ? "HIDDEN" : "ACTIVE", active: row["Is Hidden"].toUpperCase() !== "TRUE", dataOrigin: "VAMSYS_LEGACY", syncStatus: "SYNCED", lastSeenAt: new Date(), lastSyncedAt: new Date(), rawData,
      }, create: {
        vamsysRouteId: row.ID.trim(), departure, arrival, departureAirportId: airportByIcao.get(departure), arrivalAirportId: airportByIcao.get(arrival), flightNumber: row["Flight Number"].trim() || null, callsign: row.Callsign.trim() || null, route: row.Routing.trim() || null, scheduledDurationMinutes: duration(row["Flight Length (HH:MM)"]), distanceNm: integer(row["Flight Distance (NM)"]), cruiseAltitude: integer(row.Altitude), costIndex: integer(row["Cost Index"]), effectiveFrom: date(row["Start Date"]), effectiveUntil: date(row["End Date"]), operationalStatus: row["Is Hidden"].toUpperCase() === "TRUE" ? "HIDDEN" : "ACTIVE", active: row["Is Hidden"].toUpperCase() !== "TRUE", dataOrigin: "VAMSYS_LEGACY", syncStatus: "SYNCED", lastSeenAt: new Date(), lastSyncedAt: new Date(), rawData,
      } });
      await tx.routeFleetAssignment.deleteMany({ where: { routeId: route.id } });
      for (const externalId of row["Fleet IDs"].split(",").map((id) => id.trim()).filter(Boolean)) await tx.routeFleetAssignment.create({ data: { routeId: route.id, fleetId: fleetByExternal.get(externalId)!, vamsysRouteId: row.ID.trim(), vamsysFleetId: externalId } });
    }
  }, { timeout: 30_000 });
  await prisma.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "LEGACY_ROUTE_CSV_IMPORTED", entityType: "Route", message: `${actor.name} imported ${records.length} vAMSYS routes from CSV.`, metadata: result } });
  return result;
}
