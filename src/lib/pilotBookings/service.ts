import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { getFlightOfferOptions, getOperationsRouteDetails } from "@/lib/flightOffers/options";
import { cancelVamsysBooking, createVamsysBooking, VamsysApiError, type CreateVamsysBookingInput } from "@/lib/vamsys/client";
import { getValidVamsysAccessToken } from "@/lib/vamsys/token";

type Row = Record<string, unknown>;
const record = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;

function bookingId(payload: Row) {
  const data = record(payload.data);
  const attributes = record(data?.attributes);
  for (const value of [data?.id, payload.id, attributes?.id, attributes?.booking_id, payload.booking_id]) {
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return null;
}

function positiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} no es válido.`);
  return parsed;
}

export interface CreatePilotBookingInput {
  routeId: string;
  fleetId?: string | null;
  aircraftId: string;
  departureAt: Date;
  network?: string | null;
  callsign?: string | null;
  altitude?: number | null;
  passengers?: number | null;
  cargoKg?: number | null;
  userRoute?: string | null;
}

export async function createPilotBooking(pilotId: string, input: CreatePilotBookingInput) {
  if (Number.isNaN(input.departureAt.getTime()) || input.departureAt.getTime() < Date.now() - 60_000) {
    throw new Error("Selecciona una salida UTC futura válida.");
  }
  const options = await getFlightOfferOptions();
  const route = options.routes.find((item) => item.id === input.routeId);
  const aircraft = options.aircraft.find((item) => item.vamsysAircraftId === input.aircraftId);
  if (!route) throw new Error("La ruta seleccionada ya no está disponible en vAMSYS.");
  if (!aircraft) throw new Error("La aeronave seleccionada ya no está disponible.");
  const liveDetails = await getOperationsRouteDetails(route.id);
  const authorizedFleetIds = liveDetails.fleetIds.length ? liveDetails.fleetIds : route.fleetIds;
  const fleetId = input.fleetId || aircraft.fleetId || null;
  if (authorizedFleetIds.length && (!fleetId || !authorizedFleetIds.includes(fleetId))) {
    throw new Error("La aeronave no pertenece a una flota autorizada para esta ruta.");
  }
  if (fleetId && aircraft.fleetId && aircraft.fleetId !== fleetId) throw new Error("La aeronave no pertenece a la flota seleccionada.");

  const token = await getValidVamsysAccessToken(pilotId);
  const estimatedDurationMinutes = liveDetails.durationMinutes ?? route.durationMinutes;
  const estimatedArrivalAt = estimatedDurationMinutes
    ? new Date(input.departureAt.getTime() + estimatedDurationMinutes * 60_000)
    : null;
  const body: CreateVamsysBookingInput = {
    route_id: positiveInteger(route.id, "route_id"),
    aircraft_id: positiveInteger(aircraft.vamsysAircraftId, "aircraft_id"),
    departure_time: input.departureAt.toISOString(),
    network: input.network || "vatsim",
    ...(input.callsign ? { callsign: input.callsign } : route.callsign ? { callsign: route.callsign } : {}),
    ...(route.flightNumber ? { flight_number: route.flightNumber } : {}),
    ...(input.altitude ? { altitude: input.altitude } : route.altitude ? { altitude: route.altitude } : {}),
    ...(input.passengers !== null && input.passengers !== undefined ? { passengers: input.passengers } : {}),
    ...(input.cargoKg !== null && input.cargoKg !== undefined ? { cargo: input.cargoKg } : {}),
    ...(input.userRoute ? { user_route: input.userRoute } : route.userRoute ? { user_route: route.userRoute } : {}),
  };

  try {
    const response = await createVamsysBooking(token, body);
    const vamsysBookingId = bookingId(response);
    if (!vamsysBookingId) throw new Error("vAMSYS no devolvió un booking ID.");
    const saved = await prisma.pilotBooking.create({ data: {
      pilotId,
      vamsysBookingId,
      vamsysRouteId: route.id,
      vamsysAircraftId: aircraft.vamsysAircraftId,
      vamsysFleetId: fleetId,
      departureIcao: route.departure,
      arrivalIcao: route.arrival,
      flightNumber: route.flightNumber,
      callsign: input.callsign || route.callsign,
      aircraftType: aircraft.aircraftType,
      aircraftRegistration: aircraft.registration,
      selectedDepartureAt: input.departureAt,
      estimatedArrivalAt,
      estimatedDurationMinutes,
      network: body.network,
      altitude: body.altitude,
      passengers: input.passengers,
      cargoKg: input.cargoKg,
      userRoute: body.user_route,
    } });
    await writeAuditLogSafely({
      action: "PILOT_BOOKING_CREATED", entityType: "PilotBooking", entityId: saved.id,
      message: `Booking ${vamsysBookingId} creado por el piloto en ${route.departure}-${route.arrival}.`,
      metadata: { pilotId, vamsysBookingId, routeId: route.id, aircraftId: aircraft.vamsysAircraftId, departureAt: input.departureAt.toISOString() },
    });
    return saved;
  } catch (error) {
    const message = error instanceof VamsysApiError ? `vAMSYS respondió ${error.status}: ${error.message}` : error instanceof Error ? error.message : "No se pudo crear el booking.";
    await writeAuditLogSafely({ action: "PILOT_BOOKING_FAILED", entityType: "Pilot", entityId: pilotId, message, metadata: { pilotId, routeId: input.routeId } });
    throw new Error(message);
  }
}

export async function cancelPilotBooking(id: string, pilotId: string) {
  const booking = await prisma.pilotBooking.findFirst({ where: { id, pilotId } });
  if (!booking) throw new Error("No tienes acceso a este booking.");
  if (booking.status !== "BOOKED") throw new Error("Este booking ya no se puede cancelar.");
  const token = await getValidVamsysAccessToken(pilotId);
  try {
    await cancelVamsysBooking(token, booking.vamsysBookingId);
  } catch (error) {
    if (!(error instanceof VamsysApiError && error.status === 404)) throw error;
  }
  const cancelled = await prisma.pilotBooking.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), errorMessage: null } });
  await writeAuditLogSafely({
    action: "PILOT_BOOKING_CANCELLED", entityType: "PilotBooking", entityId: id,
    message: `Booking ${booking.vamsysBookingId} cancelado por el piloto sin penalización AOC.`,
    metadata: { pilotId, vamsysBookingId: booking.vamsysBookingId },
  });
  return cancelled;
}

export async function completePilotBookingFromPirep(input: { pirepId: string; vamsysBookingId: string | null }) {
  if (!input.vamsysBookingId) return false;
  const booking = await prisma.pilotBooking.findUnique({ where: { vamsysBookingId: input.vamsysBookingId } });
  if (!booking || booking.status === "FLOWN") return Boolean(booking);
  await prisma.pilotBooking.update({ where: { id: booking.id }, data: { status: "FLOWN", matchedPirepId: input.pirepId, errorMessage: null } });
  await writeAuditLogSafely({
    action: "PILOT_BOOKING_MATCHED_PIREP", entityType: "PilotBooking", entityId: booking.id,
    message: `Booking ${booking.vamsysBookingId} enlazado al PIREP aceptado.`,
    metadata: { pilotId: booking.pilotId, pirepId: input.pirepId, vamsysBookingId: booking.vamsysBookingId },
  });
  return true;
}
