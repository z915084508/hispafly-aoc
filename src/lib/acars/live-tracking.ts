import { prisma } from "@/lib/prisma";
import { connectionStatus } from "./connection-status";

export async function getLiveFlights() {
  const liveSince = new Date(Date.now() - 2 * 60 * 1000);
  const sessions = await prisma.acarsSession.findMany({
    where: { status: "ACTIVE", lastHeartbeatAt: { gte: liveSince } },
    include: {
      positions: { orderBy: { sequenceNumber: "desc" }, take: 1 },
    },
    orderBy: { lastHeartbeatAt: "desc" },
    take: 100,
  });
  const dispatches = await prisma.flightDispatch.findMany({
    where: { id: { in: sessions.map((session) => session.dispatchId) } },
    include: { flight: true, aircraft: true, pilot: true },
  });
  const byId = new Map(dispatches.map((dispatch) => [dispatch.id, dispatch]));
  return sessions.flatMap((session) => {
    const dispatch = byId.get(session.dispatchId), position = session.positions[0];
    if (!dispatch?.flight) return [];
    return [{
      id: session.id,
      localSessionId: session.localSessionId,
      flightNumber: dispatch.flight.flightNumber,
      callsign: dispatch.flight.callsign,
      departureIcao: dispatch.flight.departureIcao,
      arrivalIcao: dispatch.flight.arrivalIcao,
      pilot: dispatch.pilot.displayName,
      aircraftRegistration: dispatch.aircraft?.registration ?? "—",
      aircraftType: dispatch.aircraft?.aircraftType ?? "—",
      phase: session.currentPhase,
      connectionStatus: connectionStatus(session.lastHeartbeatAt, session.status),
      sessionStatus: session.status,
      lastHeartbeatAt: session.lastHeartbeatAt.toISOString(),
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      altitudeFeet: position?.altitudeFeet ?? null,
      groundSpeedKnots: position?.groundSpeedKnots ?? null,
      headingDegrees: position?.headingDegrees ?? null,
      fuelKg: position?.fuelKg ?? null,
      onGround: position?.onGround ?? null,
      recordedAt: position?.recordedAt.toISOString() ?? null,
    }];
  });
}

export async function getFlightTrack(sessionId: string, pilotId?: string) {
  return prisma.acarsPosition.findMany({
    where: { sessionId, ...(pilotId ? { session: { pilotId } } : {}) },
    select: { sequenceNumber: true, recordedAt: true, latitude: true, longitude: true, altitudeFeet: true, groundSpeedKnots: true, phase: true },
    orderBy: { sequenceNumber: "asc" },
    take: 2000,
  });
}
