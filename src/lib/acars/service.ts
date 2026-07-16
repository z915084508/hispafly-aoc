import { prisma } from "@/lib/prisma";

export type AcarsStartInput = {
  localSessionId: string; dispatchId: string; dispatchVersion: number; bookingId: string;
  flightId: string; aircraftId: string; simulatorName: string; acarsVersion: string; startedAt: string;
};
type PositionInput = {
  sequenceNumber: number; recordedAt: string; latitude?: number | null; longitude?: number | null;
  altitudeFeet?: number | null; groundSpeedKnots?: number | null; headingDegrees?: number | null;
  fuelKg?: number | null; onGround?: boolean | null; phase: string;
};
type EventInput = {
  sequenceNumber: number; type: string; recordedAt: string; phaseBefore?: string | null;
  phaseAfter?: string | null; message?: string | null; latitude?: number | null; longitude?: number | null;
  altitudeFeet?: number | null; groundSpeedKnots?: number | null; fuelKg?: number | null;
  numericValue?: number | null; textValue?: string | null;
};
export type TelemetryInput = { currentPhase: string; completed?: boolean; positions?: PositionInput[]; events?: EventInput[] };

export async function startAcarsSession(pilotId: string, body: AcarsStartInput) {
  const dispatch = await prisma.flightDispatch.findFirst({
    where: {
      id: body.dispatchId, pilotId, bookingId: body.bookingId, flightId: body.flightId,
      aircraftId: body.aircraftId, isCurrent: true, status: { in: ["RELEASED", "DISPATCHED"] },
      version: body.dispatchVersion,
    },
  });
  if (!dispatch) throw new Error("Released Dispatch identity mismatch.");
  return prisma.$transaction(async (tx) => {
    const session = await tx.acarsSession.upsert({
      where: { localSessionId: body.localSessionId },
      create: { ...body, pilotId, startedAt: new Date(body.startedAt), lastHeartbeatAt: new Date() },
      update: { lastHeartbeatAt: new Date() },
    });
    await tx.flightDispatch.update({ where: { id: dispatch.id }, data: { status: "DISPATCHED", acarsSessionId: session.id } });
    await tx.pilotBooking.update({ where: { id: body.bookingId }, data: { status: "IN_PROGRESS" } });
    await tx.flight.update({ where: { id: body.flightId }, data: { status: "IN_PROGRESS" } });
    await tx.aircraft.update({ where: { id: body.aircraftId }, data: { operationalStatus: "IN_FLIGHT" } });
    return session;
  });
}

export async function ingestTelemetry(pilotId: string, sessionId: string, body: TelemetryInput) {
  const session = await prisma.acarsSession.findFirst({ where: { id: sessionId, pilotId } });
  if (!session) throw new Error("ACARS session not found.");
  if ((body.positions?.length ?? 0) > 500 || (body.events?.length ?? 0) > 500) throw new Error("Telemetry batch exceeds 500 records.");
  await prisma.$transaction(async (tx) => {
    if (body.positions?.length) await tx.acarsPosition.createMany({
      data: body.positions.map((item) => ({ ...item, sessionId, recordedAt: new Date(item.recordedAt) })),
      skipDuplicates: true,
    });
    if (body.events?.length) await tx.acarsEvent.createMany({
      data: body.events.map((item) => ({ ...item, sessionId, recordedAt: new Date(item.recordedAt) })),
      skipDuplicates: true,
    });
    await tx.acarsSession.update({
      where: { id: sessionId },
      data: {
        lastHeartbeatAt: new Date(), currentPhase: body.currentPhase,
        status: body.completed ? "COMPLETED" : "ACTIVE", completedAt: body.completed ? new Date() : undefined,
      },
    });
  });
  return { acceptedPositions: body.positions?.length ?? 0, acceptedEvents: body.events?.length ?? 0 };
}
