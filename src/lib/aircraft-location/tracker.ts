import { AircraftLocationSource, AircraftLocationStatus, FlightDispatchStatus, PirepStatus } from "@prisma/client";
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

const STALE_RESERVATION_DISPATCH_STATUSES = new Set<FlightDispatchStatus>([
  "FLOWN",
  "REWARDED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

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

export async function releaseAircraftReservationFromDispatch(params: {
  vamsysAircraftId: string;
  dispatchId: string;
  bookingId?: string | null;
  reason: string;
}) {
  const current = await prisma.aircraftLocationSnapshot.findUnique({
    where: { vamsysAircraftId: params.vamsysAircraftId },
    select: { id: true, registration: true, currentAirportIcao: true, reservedByDispatchId: true, lastBookingId: true },
  });
  if (!current || current.reservedByDispatchId !== params.dispatchId) return false;

  const clearBookingId = Boolean(params.bookingId && current.lastBookingId === params.bookingId);
  const released = await prisma.aircraftLocationSnapshot.updateMany({
    where: { id: current.id, reservedByDispatchId: params.dispatchId },
    data: {
      status: "AVAILABLE",
      reservedByDispatchId: null,
      ...(clearBookingId ? { lastBookingId: null } : {}),
      lastReportAt: new Date(),
    },
  });
  if (released.count !== 1) return false;

  await writeAuditLogSafely({
    action: "AIRCRAFT_RESERVATION_RELEASED",
    entityType: "AircraftLocationSnapshot",
    entityId: current.id,
    message: `Aircraft ${current.registration ?? params.vamsysAircraftId} released from dispatch ${params.dispatchId}.`,
    metadata: {
      dispatchId: params.dispatchId,
      bookingId: params.bookingId ?? null,
      airportIcao: current.currentAirportIcao,
      reason: params.reason,
    },
  });
  return true;
}

export async function releaseStaleAircraftReservations(options: {
  staffUserId?: string | null;
  trigger?: string;
  limit?: number;
} = {}) {
  const trigger = options.trigger ?? "AUTOMATIC_RECONCILIATION";
  const limit = Math.max(1, Math.min(options.limit ?? 250, 1000));
  const result = { scanned: 0, released: 0, active: 0, missingDispatches: 0, errors: [] as string[] };

  try {
    const reservations = await prisma.aircraftLocationSnapshot.findMany({
      where: { status: "RESERVED", reservedByDispatchId: { not: null } },
      select: {
        id: true,
        vamsysAircraftId: true,
        registration: true,
        currentAirportIcao: true,
        reservedByDispatchId: true,
        lastBookingId: true,
      },
      take: limit,
    });
    result.scanned = reservations.length;
    if (!reservations.length) return result;

    const dispatchIds = [...new Set(reservations.map((item) => item.reservedByDispatchId).filter((value): value is string => Boolean(value)))];
    const dispatches = await prisma.flightDispatch.findMany({
      where: { id: { in: dispatchIds } },
      select: { id: true, status: true, vamsysBookingId: true },
    });
    const dispatchById = new Map(dispatches.map((dispatch) => [dispatch.id, dispatch]));

    for (const reservation of reservations) {
      const dispatchId = reservation.reservedByDispatchId;
      if (!dispatchId) continue;
      const dispatch = dispatchById.get(dispatchId);
      if (dispatch && !STALE_RESERVATION_DISPATCH_STATUSES.has(dispatch.status)) {
        result.active++;
        continue;
      }
      if (!dispatch) result.missingDispatches++;

      try {
        const clearBookingId = !dispatch || Boolean(dispatch.vamsysBookingId && reservation.lastBookingId === dispatch.vamsysBookingId);
        const updated = await prisma.aircraftLocationSnapshot.updateMany({
          where: {
            id: reservation.id,
            status: "RESERVED",
            reservedByDispatchId: dispatchId,
          },
          data: {
            status: "AVAILABLE",
            reservedByDispatchId: null,
            ...(clearBookingId ? { lastBookingId: null } : {}),
            lastReportAt: new Date(),
          },
        });
        if (updated.count !== 1) continue;

        result.released++;
        await writeAuditLogSafely({
          staffUserId: options.staffUserId ?? null,
          action: "AIRCRAFT_STALE_RESERVATION_RELEASED",
          entityType: "AircraftLocationSnapshot",
          entityId: reservation.id,
          message: `Aircraft ${reservation.registration ?? reservation.vamsysAircraftId} released from stale dispatch reservation ${dispatchId}.`,
          metadata: {
            trigger,
            dispatchId,
            dispatchStatus: dispatch?.status ?? "MISSING",
            bookingId: dispatch?.vamsysBookingId ?? reservation.lastBookingId,
            airportIcao: reservation.currentAirportIcao,
            clearedLastBookingId: clearBookingId,
          },
        });
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : `Failed to release reservation ${reservation.id}.`);
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Failed to reconcile stale aircraft reservations.");
  }

  if (result.released || result.errors.length) {
    await writeAuditLogSafely({
      staffUserId: options.staffUserId ?? null,
      action: result.errors.length ? "AIRCRAFT_STALE_RESERVATION_RECONCILIATION_COMPLETED_WITH_ERRORS" : "AIRCRAFT_STALE_RESERVATION_RECONCILIATION_COMPLETED",
      entityType: "AircraftLocationSnapshot",
      message: `Stale aircraft reservation reconciliation released ${result.released} of ${result.scanned} scanned reservations.`,
      metadata: {
        trigger,
        scanned: result.scanned,
        released: result.released,
        active: result.active,
        missingDispatches: result.missingDispatches,
        errors: result.errors.length,
      },
    });
  }
  return result;
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
  await releaseStaleAircraftReservations({ trigger: "AIRCRAFT_LOCATION_SUMMARY_AUTO_RECONCILIATION" });
  const [total, groups, airportsWithAircraft, externalMovedAircraft] = await Promise.all([
    prisma.aircraftLocationSnapshot.count(),
    prisma.aircraftLocationSnapshot.groupBy({ by: ["status"], _count: true }),
    prisma.aircraftLocationSnapshot.groupBy({ by: ["currentAirportIcao"], where: { currentAirportIcao: { not: null } } }),
    prisma.aircraftLocationSnapshot.count({ where: { source: "VAMSYS_EXTERNAL" } }),
  ]);
  const count = (status: AircraftLocationStatus) => groups.find((g) => g.status === status)?._count ?? 0;
  return { total, available: count("AVAILABLE"), reserved: count("RESERVED"), inFlight: count("IN_FLIGHT"), maintenance: count("MAINTENANCE"), unknown: count("UNKNOWN"), airportsWithAircraft: airportsWithAircraft.length, externalMovedAircraft };
}

export async function getAircraftLocationList() {
  await releaseStaleAircraftReservations({ trigger: "AIRCRAFT_LOCATION_LIST_AUTO_RECONCILIATION" });
  return prisma.aircraftLocationSnapshot.findMany({ orderBy: [{ status: "asc" }, { registration: "asc" }, { vamsysAircraftId: "asc" }], select: { id: true, vamsysAircraftId: true, registration: true, aircraftType: true, currentAirportIcao: true, currentAirportIata: true, status: true, source: true, lastBookingId: true, lastVamsysPirepId: true, lastLatitude: true, lastLongitude: true, lastReportAt: true, updatedAt: true } });
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
