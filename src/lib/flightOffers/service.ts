import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { cancelVamsysBooking, createVamsysBooking, VamsysApiError, type CreateVamsysBookingInput } from "@/lib/vamsys/client";
import { getValidVamsysAccessToken } from "@/lib/vamsys/token";

type JsonRow = Record<string, unknown>;

function record(value: unknown): JsonRow | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRow : null;
}

function bookingIdFromResponse(payload: JsonRow): string | null {
  const data = record(payload.data);
  const attributes = record(data?.attributes);
  for (const value of [data?.id, payload.id, attributes?.id, attributes?.booking_id, payload.booking_id]) {
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return null;
}

function numericId(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} de vAMSYS no es válido.`);
  return parsed;
}

export async function dispatchFlightOffer(offerId: string, pilotId: string) {
  const offer = await prisma.flightOffer.findUnique({ where: { id: offerId } });
  if (!offer) throw new Error("La oferta de vuelo no existe.");
  if (offer.status !== "PUBLISHED") throw new Error("Esta oferta ya no está publicada.");
  if (offer.validUntil.getTime() <= Date.now()) {
    await prisma.flightOffer.update({ where: { id: offer.id }, data: { status: "EXPIRED" } });
    throw new Error("Esta oferta ha caducado.");
  }

  const oauth = await prisma.vamsysOAuthToken.findUnique({ where: { pilotId }, select: { scopes: true, revokedAt: true } });
  const grantedScopes = new Set(oauth?.scopes.split(/\s+/).filter(Boolean) ?? []);
  if (!oauth || oauth.revokedAt || !grantedScopes.has("flights:write")) {
    throw new Error("Reconecta vAMSYS para autorizar flights:write antes de hacer Dispatch.");
  }
  const accessToken = await getValidVamsysAccessToken(pilotId).catch(() => {
    throw new Error("Conecta vAMSYS para dispatch.");
  });

  let dispatch;
  try {
    dispatch = await prisma.$transaction(async (tx) => {
      const claimed = await tx.flightOffer.updateMany({ where: { id: offer.id, status: "PUBLISHED" }, data: { status: "DISPATCHED" } });
      if (claimed.count !== 1) throw new Error("Esta oferta ya ha sido despachada.");
      const existing = await tx.flightDispatch.findFirst({ where: { flightOfferId: offer.id, status: { in: ["DISPATCHING", "DISPATCHED"] } } });
      if (existing) throw new Error("Esta oferta ya ha sido despachada.");
      return tx.flightDispatch.create({ data: { flightOfferId: offer.id, pilotId, status: "DISPATCHING" } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("Esta oferta ya ha sido despachada.");
    throw error;
  }

  const body: CreateVamsysBookingInput = {
    route_id: numericId(offer.vamsysRouteId, "route_id"),
    aircraft_id: numericId(offer.vamsysAircraftId, "aircraft_id"),
    departure_time: offer.scheduledDeparture.toISOString(),
    ...(offer.network ? { network: offer.network } : {}),
    ...(offer.callsign ? { callsign: offer.callsign } : {}),
    ...(offer.flightNumber ? { flight_number: offer.flightNumber } : {}),
    ...(offer.altitude !== null ? { altitude: offer.altitude } : {}),
    ...(offer.passengers !== null ? { passengers: offer.passengers } : {}),
    ...(offer.cargoKg !== null ? { cargo: offer.cargoKg } : {}),
    ...(offer.userRoute ? { user_route: offer.userRoute } : {}),
  };

  try {
    const response = await createVamsysBooking(accessToken, body);
    const vamsysBookingId = bookingIdFromResponse(response);
    if (!vamsysBookingId) throw new Error("vAMSYS no devolvió un booking ID.");
    const completed = await prisma.$transaction(async (tx) => {
      const saved = await tx.flightDispatch.update({
        where: { id: dispatch.id },
        data: { status: "DISPATCHED", vamsysBookingId, dispatchedAt: new Date(), errorMessage: null },
      });
      await tx.flightOffer.update({ where: { id: offer.id }, data: { status: "DISPATCHED" } });
      return saved;
    });
    await writeAuditLogSafely({
      action: "VAMSYS_BOOKING_CREATED", entityType: "FlightDispatch", entityId: dispatch.id,
      message: `Booking ${vamsysBookingId} creado desde la oferta ${offer.title}.`,
      metadata: { pilotId, offerId: offer.id, vamsysBookingId },
    });
    return completed;
  } catch (error) {
    const message = error instanceof VamsysApiError
      ? `vAMSYS respondió ${error.status}: ${error.message}`
      : error instanceof Error ? error.message : "Error desconocido al crear el booking.";
    await prisma.$transaction([
      prisma.flightDispatch.update({ where: { id: dispatch.id }, data: { status: "FAILED", errorMessage: message } }),
      prisma.flightOffer.update({ where: { id: offer.id }, data: { status: offer.validUntil > new Date() ? "PUBLISHED" : "EXPIRED" } }),
    ]);
    await writeAuditLogSafely({
      action: "VAMSYS_BOOKING_FAILED", entityType: "FlightDispatch", entityId: dispatch.id,
      message: `No se pudo crear el booking de la oferta ${offer.title}: ${message}`,
      metadata: { pilotId, offerId: offer.id, status: error instanceof VamsysApiError ? error.status : null },
    });
    throw new Error(message);
  }
}

const PILOT_CANCEL_PENALTY_CENTS = 5_000;
const EXPIRED_OFFER_PENALTY_CENTS = 10_000;

async function applyDispatchPenalty(dispatchId: string, amountCents: number, description: string, status: "CANCELLED" | "EXPIRED") {
  return prisma.$transaction(async (tx) => {
    const current = await tx.flightDispatch.findUnique({ where: { id: dispatchId }, include: { flightOffer: true } });
    if (!current) throw new Error("El dispatch no existe.");
    if (current.status === "CANCELLED" || current.status === "EXPIRED") return current;
    if (current.status !== "DISPATCHED") throw new Error("Este dispatch ya no se puede cancelar.");

    await tx.walletTransaction.create({
      data: {
        pilotId: current.pilotId,
        flightDispatchId: current.id,
        type: "penalty",
        amountCents: -amountCents,
        description,
        reference: current.vamsysBookingId,
      },
    });
    await tx.pilot.update({ where: { id: current.pilotId }, data: { walletBalanceCents: { decrement: amountCents } } });
    const dispatch = await tx.flightDispatch.update({
      where: { id: current.id },
      data: { status, cancelledAt: status === "CANCELLED" ? new Date() : current.cancelledAt, completedAt: status === "EXPIRED" ? new Date() : current.completedAt, errorMessage: null },
    });
    await tx.flightOffer.update({
      where: { id: current.flightOfferId },
      data: { status: status === "CANCELLED" && current.flightOffer.validUntil > new Date() ? "PUBLISHED" : "EXPIRED" },
    });
    return dispatch;
  });
}

export async function cancelFlightDispatchByPilot(dispatchId: string, pilotId: string) {
  const dispatch = await prisma.flightDispatch.findFirst({
    where: { id: dispatchId, pilotId },
    include: { flightOffer: true },
  });
  if (!dispatch) throw new Error("No tienes acceso a este dispatch.");
  if (dispatch.status !== "DISPATCHED" || !dispatch.vamsysBookingId) throw new Error("Este dispatch ya no se puede cancelar.");
  if (dispatch.flightOffer.validUntil <= new Date()) throw new Error("La oferta ya ha caducado; se aplicará la penalización por expiración.");

  const accessToken = await getValidVamsysAccessToken(pilotId);
  try {
    await cancelVamsysBooking(accessToken, dispatch.vamsysBookingId);
  } catch (error) {
    if (!(error instanceof VamsysApiError && error.status === 404)) throw error;
  }

  const cancelled = await applyDispatchPenalty(dispatch.id, PILOT_CANCEL_PENALTY_CENTS, `Cancelación voluntaria: ${dispatch.flightOffer.title}`, "CANCELLED");
  await writeAuditLogSafely({
    action: "FLIGHT_DISPATCH_CANCELLED_BY_PILOT", entityType: "FlightDispatch", entityId: dispatch.id,
    message: `El piloto canceló ${dispatch.flightOffer.title}; la oferta volvió a publicarse y se descontaron 50 € de su cartera.`,
    metadata: { pilotId, offerId: dispatch.flightOfferId, bookingId: dispatch.vamsysBookingId, penaltyCents: PILOT_CANCEL_PENALTY_CENTS },
  });
  return cancelled;
}

export async function expireOverdueFlightDispatches(limit = 10) {
  const overdue = await prisma.flightDispatch.findMany({
    where: { status: "DISPATCHED", matchedPirepId: null, flightOffer: { validUntil: { lte: new Date() } } },
    include: { flightOffer: true },
    orderBy: { flightOffer: { validUntil: "asc" } },
    take: Math.max(1, Math.min(limit, 50)),
  });
  let expired = 0; const errors: string[] = [];
  for (const dispatch of overdue) {
    try {
      if (dispatch.vamsysBookingId) {
        try {
          const accessToken = await getValidVamsysAccessToken(dispatch.pilotId);
          await cancelVamsysBooking(accessToken, dispatch.vamsysBookingId);
        } catch (error) {
          if (!(error instanceof VamsysApiError && error.status === 404)) console.warn(`[Flight offer expiry] booking cancellation failed dispatch=${dispatch.id}`, error);
        }
      }
      await applyDispatchPenalty(dispatch.id, EXPIRED_OFFER_PENALTY_CENTS, `Oferta expirada sin volar: ${dispatch.flightOffer.title}`, "EXPIRED");
      await writeAuditLogSafely({
        action: "FLIGHT_DISPATCH_EXPIRED", entityType: "FlightDispatch", entityId: dispatch.id,
        message: `${dispatch.flightOffer.title} expiró sin PIREP aceptado; se descontaron 100 € de la cartera del piloto.`,
        metadata: { pilotId: dispatch.pilotId, offerId: dispatch.flightOfferId, bookingId: dispatch.vamsysBookingId, penaltyCents: EXPIRED_OFFER_PENALTY_CENTS },
      });
      expired++;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Error desconocido al expirar dispatch.");
    }
  }
  return { expired, errors };
}

export async function completeFlightDispatchFromPirep(input: {
  pirepId: string;
  vamsysPirepId: string;
  vamsysBookingId: string | null;
}) {
  if (!input.vamsysBookingId) return { matched: false, rewarded: false };
  const dispatch = await prisma.flightDispatch.findUnique({
    where: { vamsysBookingId: input.vamsysBookingId },
    include: { flightOffer: true },
  });
  if (!dispatch) return { matched: false, rewarded: false };

  const completedAt = dispatch.completedAt ?? new Date();
  await prisma.flightDispatch.update({
    where: { id: dispatch.id },
    data: {
      status: dispatch.rewardedAt ? "REWARDED" : "FLOWN",
      vamsysPirepId: input.vamsysPirepId,
      matchedPirepId: input.pirepId,
      completedAt,
      errorMessage: null,
    },
  });
  await prisma.flightOffer.update({ where: { id: dispatch.flightOfferId }, data: { status: "FLOWN" } });
  if (!dispatch.completedAt) {
    await writeAuditLogSafely({
      action: "FLIGHT_DISPATCH_COMPLETED_BY_PIREP", entityType: "FlightDispatch", entityId: dispatch.id,
      message: `La oferta ${dispatch.flightOffer.title} se completó con el PIREP ${input.vamsysPirepId}.`,
      metadata: { pilotId: dispatch.pilotId, bookingId: input.vamsysBookingId, pirepId: input.pirepId },
    });
  }

  if (dispatch.rewardedAt || dispatch.flightOffer.rewardCents <= 0) return { matched: true, rewarded: Boolean(dispatch.rewardedAt) };
  const payroll = await prisma.payrollRecord.findUnique({ where: { pirepId: input.pirepId }, select: { amountCents: true } });
  const rewardCents = dispatch.flightOffer.rewardType === "FIXED"
    ? dispatch.flightOffer.rewardCents
    : Math.round((payroll?.amountCents ?? 0) * dispatch.flightOffer.rewardCents / 10_000);
  if (rewardCents <= 0) return { matched: true, rewarded: false };

  try {
    await prisma.$transaction(async (tx) => {
      const latest = await tx.flightDispatch.findUnique({ where: { id: dispatch.id }, select: { rewardedAt: true } });
      if (latest?.rewardedAt) return;
      await tx.walletTransaction.create({
        data: {
          pilotId: dispatch.pilotId,
          flightDispatchId: dispatch.id,
          type: "bonus",
          amountCents: rewardCents,
          description: `Mission reward: ${dispatch.flightOffer.title}`,
          reference: input.vamsysBookingId,
        },
      });
      await tx.pilot.update({ where: { id: dispatch.pilotId }, data: { walletBalanceCents: { increment: rewardCents } } });
      await tx.flightDispatch.update({ where: { id: dispatch.id }, data: { status: "REWARDED", rewardedAt: new Date() } });
    });
    await writeAuditLogSafely({
      action: "FLIGHT_DISPATCH_REWARDED", entityType: "FlightDispatch", entityId: dispatch.id,
      message: `Mission reward abonado para ${dispatch.flightOffer.title}.`,
      metadata: { pilotId: dispatch.pilotId, rewardCents, bookingId: input.vamsysBookingId },
    });
    return { matched: true, rewarded: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { matched: true, rewarded: true };
    throw error;
  }
}
