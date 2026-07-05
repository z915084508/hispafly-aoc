import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { getFlightOfferOptions, getOperationsRouteDetails } from "@/lib/flightOffers/options";
import { cancelVamsysBooking, createVamsysBooking, VamsysApiError, type CreateVamsysBookingInput } from "@/lib/vamsys/client";
import { getValidVamsysAccessToken } from "@/lib/vamsys/token";
import { assertAircraftDispatchAllowed } from "@/lib/aircraft-maintenance/service";
import { calculateDispatchPayload } from "@/lib/dispatch/loadFactor";
import { prepareFlightOffer } from "@/lib/flightOffers/service";
import { normalizeFlightIdentity } from "@/lib/dispatch/flightIdentity";

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

export interface PreparePilotBookingInput extends Omit<CreatePilotBookingInput, "passengers" | "cargoKg"> {
  loadFactorPercent: number;
  baggageKgPerPassenger: number;
  freightKg?: number | null;
}

export async function preparePilotBooking(pilotId: string, input: PreparePilotBookingInput) {
  if (Number.isNaN(input.departureAt.getTime()) || input.departureAt.getTime() < Date.now() - 60_000) throw new Error("Select a valid future UTC departure.");
  const options = await getFlightOfferOptions();
  const route = options.routes.find((item) => item.id === input.routeId);
  const aircraftOption = options.aircraft.find((item) => item.vamsysAircraftId === input.aircraftId);
  if (!route) throw new Error("The selected vAMSYS route is no longer available.");
  if (!aircraftOption) throw new Error("The selected aircraft is no longer available.");
  await assertAircraftDispatchAllowed({ vamsysAircraftId: aircraftOption.vamsysAircraftId, offerType: "SELF_DISPATCH", arrivalIcao: route.arrival });
  const liveDetails = await getOperationsRouteDetails(route.id);
  const fleetId = input.fleetId || aircraftOption.fleetId || null;
  const authorizedFleetIds = liveDetails.fleetIds.length ? liveDetails.fleetIds : route.fleetIds;
  if (authorizedFleetIds.length && (!fleetId || !authorizedFleetIds.includes(fleetId))) throw new Error("The selected aircraft is not in an authorized fleet for this route.");
  const aircraft = await prisma.aircraft.findUnique({ where: { vamsysAircraftId: aircraftOption.vamsysAircraftId } });
  const seats = aircraft?.seatCapacity;
  if (!seats) throw new Error("Configure the fleet maximum seats in Aircraft Performance before preparing this OFP.");
  const payload = calculateDispatchPayload({ seats, loadFactorPercent: input.loadFactorPercent, baggageKgPerPassenger: input.baggageKgPerPassenger });
  const estimatedDurationMinutes = liveDetails.durationMinutes ?? route.durationMinutes;
  if (!estimatedDurationMinutes) throw new Error("The route duration is unavailable.");
  const estimatedArrivalAt = new Date(input.departureAt.getTime() + estimatedDurationMinutes * 60_000);
  const identity = normalizeFlightIdentity({ flightNumber: route.flightNumber, callsign: input.callsign || route.callsign });
  const offer = await prisma.flightOffer.create({ data: {
    title: `Self Dispatch ${route.flightNumber ?? `${route.departure}-${route.arrival}`}`,
    offerType: "SELF_DISPATCH",
    flightNumber: identity.commercialFlightNumber || null,
    callsign: identity.atcCallsign || null,
    departureIcao: route.departure,
    arrivalIcao: route.arrival,
    vamsysRouteId: route.id,
    vamsysAircraftId: aircraftOption.vamsysAircraftId,
    vamsysFleetId: fleetId,
    availableFrom: new Date(Date.now() - 60_000),
    scheduledDeparture: input.departureAt,
    scheduledArrival: estimatedArrivalAt,
    estimatedDurationMinutes,
    aircraftType: aircraftOption.aircraftType,
    aircraftRegistration: aircraftOption.registration,
    passengers: payload.passengers,
    cargoKg: payload.luggageKg,
    loadFactorPercent: input.loadFactorPercent,
    luggageKg: payload.luggageKg,
    freightKg: input.freightKg ?? 0,
    baggageKgPerPassenger: payload.baggageKgPerPassenger,
    altitude: input.altitude ?? route.altitude,
    network: input.network || "vatsim",
    userRoute: input.userRoute || route.userRoute,
    rewardCents: 0,
    validUntil: new Date(estimatedArrivalAt.getTime() + 6 * 60 * 60_000),
    status: "PUBLISHED",
    createdByPilotId: pilotId,
  }});
  try {
    const dispatch = await prepareFlightOffer(offer.id, pilotId, input.departureAt);
    return dispatch;
  } catch (error) {
    await prisma.flightOffer.delete({ where: { id: offer.id } }).catch(() => undefined);
    throw error;
  }
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
  await assertAircraftDispatchAllowed({ vamsysAircraftId: aircraft.vamsysAircraftId, offerType: "STANDARD", arrivalIcao: route.arrival });
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
  const identity = normalizeFlightIdentity({ flightNumber: route.flightNumber, callsign: input.callsign || route.callsign });
  const body: CreateVamsysBookingInput = {
    route_id: positiveInteger(route.id, "route_id"),
    aircraft_id: positiveInteger(aircraft.vamsysAircraftId, "aircraft_id"),
    departure_time: input.departureAt.toISOString(),
    network: input.network || "vatsim",
    ...(identity.atcCallsign ? { callsign: identity.atcCallsign } : {}),
    ...(identity.commercialFlightNumber ? { flight_number: identity.commercialFlightNumber } : {}),
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
      flightNumber: identity.commercialFlightNumber || null,
      callsign: identity.atcCallsign || null,
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
