import { AircraftLocationSource, AircraftLocationStatus, PirepStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";

type JsonRow = Record<string, unknown>;
const row = (value: unknown): JsonRow | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRow : null;
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : null;
const pick = (source: JsonRow | null, ...keys: string[]) => {
  if (!source) return null;
  for (const key of keys) { const value = text(source[key]); if (value) return value; }
  return null;
};

export function extractAircraftLocationData(rawData: unknown, fallback: { arrival?: string | null; aircraftType?: string | null } = {}) {
  const root = row(rawData) ?? {};
  const attributes = row(root.attributes) ?? {};
  const source = { ...attributes, ...root };
  const booking = row(source.booking);
  const aircraft = row(source.aircraft) ?? row(booking?.aircraft);
  const fleet = row(source.fleet) ?? row(booking?.fleet);
  const arrival = row(source.arrival_airport) ?? row(source.arrival) ?? row(booking?.arrival);
  return {
    vamsysAircraftId: pick(source, "aircraft_id", "aircraftId") ?? pick(aircraft, "id", "aircraft_id"),
    registration: pick(source, "aircraft_registration", "registration") ?? pick(aircraft, "registration", "reg"),
    aircraftType: fallback.aircraftType ?? pick(aircraft, "type", "icao", "code") ?? pick(fleet, "code", "icao", "name"),
    arrivalAirportId: pick(source, "arrival_airport_id", "arrival_id") ?? pick(arrival, "id"),
    arrivalIcao: (pick(arrival, "icao", "ident", "code") ?? fallback.arrival ?? "").toUpperCase() || null,
    arrivalIata: pick(arrival, "iata")?.toUpperCase() ?? null,
  };
}

async function airportDetails(icao: string | null, externalId?: string | null) {
  if (!icao) return { id: externalId ?? null, iata: null, latitude: null, longitude: null };
  const airport = await prisma.airport.findUnique({ where: { icao }, select: { id: true, iata: true, latitude: true, longitude: true } });
  return { id: airport?.id ?? externalId ?? null, iata: airport?.iata ?? null, latitude: airport?.latitude ?? null, longitude: airport?.longitude ?? null };
}

export async function updateAircraftLocationFromDispatch(params: {
  vamsysAircraftId: string; registration?: string | null; aircraftType?: string | null;
  departureAirportId?: string | null; departureIcao: string; departureIata?: string | null;
  dispatchId: string; bookingId: string; reportAt?: Date;
}) {
  const icao = params.departureIcao.toUpperCase();
  const airport = await airportDetails(icao, params.departureAirportId);
  const snapshot = await prisma.aircraftLocationSnapshot.upsert({
    where: { vamsysAircraftId: params.vamsysAircraftId },
    create: { vamsysAircraftId: params.vamsysAircraftId, registration: params.registration, aircraftType: params.aircraftType, currentAirportId: airport.id, currentAirportIcao: icao, currentAirportIata: params.departureIata ?? airport.iata, status: "RESERVED", source: "DISPATCH", reservedByDispatchId: params.dispatchId, lastBookingId: params.bookingId, lastReportAt: params.reportAt ?? new Date(), lastLatitude: airport.latitude, lastLongitude: airport.longitude },
    update: { registration: params.registration, aircraftType: params.aircraftType, currentAirportId: airport.id, currentAirportIcao: icao, currentAirportIata: params.departureIata ?? airport.iata, status: "RESERVED", source: "DISPATCH", reservedByDispatchId: params.dispatchId, lastBookingId: params.bookingId, lastReportAt: params.reportAt ?? new Date(), lastLatitude: airport.latitude, lastLongitude: airport.longitude },
  });
  await writeAuditLogSafely({ action: "AIRCRAFT_LOCATION_UPDATED_BY_DISPATCH", entityType: "AircraftLocationSnapshot", entityId: snapshot.id, message: `Aircraft ${params.vamsysAircraftId} reserved at ${icao}.`, metadata: { dispatchId: params.dispatchId, bookingId: params.bookingId, airportIcao: icao } });
  return snapshot;
}

export async function updateAircraftLocationFromAcceptedPirep(params: {
  vamsysAircraftId: string; registration?: string | null; aircraftType?: string | null;
  arrivalAirportId?: string | null; arrivalIcao: string; arrivalIata?: string | null;
  pirepId: string; vamsysPirepId: string; matchedDispatchId?: string | null; reportAt?: Date;
}) {
  const icao = params.arrivalIcao.toUpperCase();
  const airport = await airportDetails(icao, params.arrivalAirportId);
  const source: AircraftLocationSource = params.matchedDispatchId ? "PIREP" : "VAMSYS_EXTERNAL";
  const snapshot = await prisma.aircraftLocationSnapshot.upsert({
    where: { vamsysAircraftId: params.vamsysAircraftId },
    create: { vamsysAircraftId: params.vamsysAircraftId, registration: params.registration, aircraftType: params.aircraftType, currentAirportId: airport.id, currentAirportIcao: icao, currentAirportIata: params.arrivalIata ?? airport.iata, status: "AVAILABLE", source, lastPirepId: params.pirepId, lastVamsysPirepId: params.vamsysPirepId, lastReportAt: params.reportAt ?? new Date(), lastLatitude: airport.latitude, lastLongitude: airport.longitude },
    update: { registration: params.registration, aircraftType: params.aircraftType, currentAirportId: airport.id, currentAirportIcao: icao, currentAirportIata: params.arrivalIata ?? airport.iata, status: "AVAILABLE", source, reservedByDispatchId: null, lastPirepId: params.pirepId, lastVamsysPirepId: params.vamsysPirepId, lastReportAt: params.reportAt ?? new Date(), lastLatitude: airport.latitude, lastLongitude: airport.longitude },
  });
  await writeAuditLogSafely({ action: params.matchedDispatchId ? "AIRCRAFT_LOCATION_UPDATED_BY_PIREP" : "AIRCRAFT_LOCATION_UPDATED_BY_EXTERNAL_PIREP", entityType: "AircraftLocationSnapshot", entityId: snapshot.id, message: `Aircraft ${params.vamsysAircraftId} available at ${icao}.`, metadata: { pirepId: params.pirepId, vamsysPirepId: params.vamsysPirepId, airportIcao: icao, matchedDispatchId: params.matchedDispatchId ?? null } });
  return snapshot;
}

export async function syncAircraftLocationsFromPireps() {
  const result = { processed: 0, updated: 0, skipped: 0, errors: [] as string[] };
  await writeAuditLogSafely({ action: "AIRCRAFT_LOCATION_SYNC_STARTED", entityType: "AircraftLocationSnapshot", message: "Aircraft location PIREP sync started." });
  try {
    const pireps = await prisma.pirep.findMany({ where: { status: PirepStatus.accepted }, orderBy: [{ acceptedAt: "desc" }, { flownAt: "desc" }, { updatedAt: "desc" }], take: 1000, select: { id: true, vamsysPirepId: true, arrival: true, aircraftType: true, rawData: true, acceptedAt: true, flownAt: true } });
    const seen = new Set<string>();
    for (const pirep of pireps) {
      if (seen.size >= 100) break;
      result.processed++;
      const data = extractAircraftLocationData(pirep.rawData, pirep);
      if (!data.vamsysAircraftId || !data.arrivalIcao || seen.has(data.vamsysAircraftId)) { result.skipped++; continue; }
      seen.add(data.vamsysAircraftId);
      try {
        const dispatch = await prisma.flightDispatch.findFirst({ where: { matchedPirepId: pirep.id }, select: { id: true } });
        await updateAircraftLocationFromAcceptedPirep({ ...data, vamsysAircraftId: data.vamsysAircraftId, arrivalIcao: data.arrivalIcao, pirepId: pirep.id, vamsysPirepId: pirep.vamsysPirepId, matchedDispatchId: dispatch?.id, reportAt: pirep.flownAt ?? pirep.acceptedAt ?? undefined });
        result.updated++;
      } catch (error) { result.errors.push(error instanceof Error ? error.message : "Unknown aircraft location error."); }
    }
    await writeAuditLogSafely({ action: "AIRCRAFT_LOCATION_SYNC_COMPLETED", entityType: "AircraftLocationSnapshot", message: `Aircraft location sync updated ${result.updated} aircraft.`, metadata: { processed: result.processed, updated: result.updated, skipped: result.skipped, errors: result.errors.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown aircraft location sync error.";
    result.errors.push(message);
    await writeAuditLogSafely({ action: "AIRCRAFT_LOCATION_SYNC_FAILED", entityType: "AircraftLocationSnapshot", message });
  }
  return result;
}

export async function getAircraftLocationSummary() {
  const [total, groups, airportsWithAircraft, externalMovedAircraft] = await Promise.all([
    prisma.aircraftLocationSnapshot.count(),
    prisma.aircraftLocationSnapshot.groupBy({ by: ["status"], _count: true }),
    prisma.aircraftLocationSnapshot.groupBy({ by: ["currentAirportIcao"], where: { currentAirportIcao: { not: null } } }),
    prisma.aircraftLocationSnapshot.count({ where: { source: "VAMSYS_EXTERNAL" } }),
  ]);
  const count = (status: AircraftLocationStatus) => groups.find((g) => g.status === status)?._count ?? 0;
  return { total, available: count("AVAILABLE"), reserved: count("RESERVED"), inFlight: count("IN_FLIGHT"), maintenance: count("MAINTENANCE"), unknown: count("UNKNOWN"), airportsWithAircraft: airportsWithAircraft.length, externalMovedAircraft };
}

export function getAircraftLocationList() {
  return prisma.aircraftLocationSnapshot.findMany({ orderBy: [{ status: "asc" }, { registration: "asc" }, { vamsysAircraftId: "asc" }], select: { id: true, vamsysAircraftId: true, registration: true, aircraftType: true, currentAirportIcao: true, currentAirportIata: true, status: true, source: true, lastReportAt: true, updatedAt: true } });
}

export async function getRepositionCandidates() {
  const active = await prisma.flightDispatch.findMany({ where: { status: { in: ["DISPATCHING", "DISPATCHED"] } }, select: { flightOffer: { select: { vamsysAircraftId: true } } } });
  return prisma.aircraftLocationSnapshot.findMany({ where: { status: "AVAILABLE", currentAirportIcao: { not: null }, vamsysAircraftId: { notIn: active.map((d) => d.flightOffer.vamsysAircraftId) } }, orderBy: { currentAirportIcao: "asc" } });
}

export async function setAircraftLocationManually(params: { vamsysAircraftId: string; registration?: string | null; aircraftType?: string | null; airportIcao?: string | null; status: AircraftLocationStatus; notes?: string | null; staffUserId?: string | null }) {
  const icao = params.airportIcao?.trim().toUpperCase() || null;
  const airport = await airportDetails(icao);
  const snapshot = await prisma.aircraftLocationSnapshot.upsert({ where: { vamsysAircraftId: params.vamsysAircraftId }, create: { vamsysAircraftId: params.vamsysAircraftId, registration: params.registration, aircraftType: params.aircraftType, currentAirportId: airport.id, currentAirportIcao: icao, currentAirportIata: airport.iata, status: params.status, source: "MANUAL", notes: params.notes, lastReportAt: new Date(), lastLatitude: airport.latitude, lastLongitude: airport.longitude }, update: { registration: params.registration, aircraftType: params.aircraftType, currentAirportId: airport.id, currentAirportIcao: icao, currentAirportIata: airport.iata, status: params.status, source: "MANUAL", notes: params.notes, reservedByDispatchId: null, lastReportAt: new Date(), lastLatitude: airport.latitude, lastLongitude: airport.longitude } });
  await writeAuditLogSafely({ staffUserId: params.staffUserId, action: "AIRCRAFT_LOCATION_MANUAL_SET", entityType: "AircraftLocationSnapshot", entityId: snapshot.id, message: `Aircraft ${params.vamsysAircraftId} location manually updated.`, metadata: { airportIcao: icao, status: params.status } });
  return snapshot;
}
