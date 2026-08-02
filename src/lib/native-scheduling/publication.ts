import { createHash } from "node:crypto";
import { AocDataOrigin, NativeFlightStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import { buildScheduleGenerationPlan, generationIdentity, type GenerationSchedule, type ScheduleGenerationPlan } from "./generation";
import { toProposedSchedule } from "./presentation";
import { validateProposedSchedule } from "./service";

const scheduleInclude = { route: { include: { departureAirport: true, arrivalAirport: true, identityReservation: true } } } as const;
type Db = Prisma.TransactionClient | typeof prisma;
type LoadedSchedule = Prisma.FlightScheduleGetPayload<{ include: typeof scheduleInclude }>;

export class SchedulePublicationError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "SchedulePublicationError"; }
}
export type FlightGenerationResult = { scheduleId: string; created: number; existing: number; skipped: number; conflicts: number; createdFlightIds: string[]; existingFlightIds: string[]; skipReasons: Record<string, number>; rangeStart: Date; rangeEnd: Date };
export type PublicationPreview = { schedule: LoadedSchedule; validation: Awaited<ReturnType<typeof validateProposedSchedule>>; plan: ScheduleGenerationPlan; warningFingerprint: string; warnings: Array<{ code: string; message: string }>; blockingIssues: Array<{ code: string; message: string }>; expectedCreated: number; existing: number; conflicts: number };

const actorId = (actor: StaffIdentity) => actor.id === "development-staff" ? null : actor.id;
const warningFingerprint = (codes: string[]) => createHash("sha256").update([...new Set(codes)].sort().join("\n")).digest("hex");
const day = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const scheduleShape = (schedule: LoadedSchedule): GenerationSchedule => schedule;

async function inspectPlan(db: Db, schedule: LoadedSchedule, plan: ScheduleGenerationPlan) {
  const keys = plan.candidates.map(({ generationKey }) => generationKey);
  const existing = keys.length ? await db.flight.findMany({ where: { generationKey: { in: keys } }, select: { id: true, generationKey: true } }) : [];
  const existingKeys = new Set(existing.map(({ generationKey }) => generationKey));
  const identity = generationIdentity(scheduleShape(schedule));
  const pending = plan.candidates.filter(({ generationKey }) => !existingKeys.has(generationKey));
  const conflicts = identity && pending.length ? await db.flight.findMany({ where: { AND: [{ OR: pending.map((candidate) => ({ operatingDate: day(candidate.operatingDate), flightNumber: identity.flightNumber, scheduledDeparture: candidate.scheduledDeparture })) }, { OR: [{ generationKey: null }, { generationKey: { notIn: keys } }] }] }, select: { id: true } }) : [];
  return { existing, existingKeys, conflicts };
}

async function previewWithDb(db: Db, scheduleId: string, now: Date): Promise<PublicationPreview> {
  const schedule = await db.flightSchedule.findUnique({ where: { id: scheduleId }, include: scheduleInclude });
  if (!schedule) throw new SchedulePublicationError("SCHEDULE_NOT_FOUND", "La programación no existe.");
  const validation = await validateProposedSchedule(toProposedSchedule(schedule), { excludeScheduleId: schedule.id, db });
  const plan = buildScheduleGenerationPlan({ schedule: scheduleShape(schedule), now });
  const blockingIssues: Array<{ code: string; message: string }> = [...validation.errors];
  if (schedule.effectiveUntil && day(schedule.effectiveUntil) < day(now)) blockingIssues.push({ code: "SCHEDULE_EFFECTIVE_PERIOD_EXPIRED", message: "El periodo efectivo de la programación ya ha finalizado." });
  if (!generationIdentity(scheduleShape(schedule))) blockingIssues.push({ code: "ROUTE_FLIGHT_IDENTITY_MISSING", message: "La ruta no dispone de número de vuelo e indicativo válidos." });
  if (!schedule.route.departureAirportId || !schedule.route.arrivalAirportId || !schedule.route.departureAirport || !schedule.route.arrivalAirport) blockingIssues.push({ code: "ROUTE_AIRPORTS_MISSING", message: "La ruta no dispone de aeropuertos válidos." });
  const inspected = await inspectPlan(db, schedule, plan);
  if (inspected.conflicts.length) blockingIssues.push({ code: "FLIGHT_NATURAL_KEY_CONFLICT", message: "Ya existe un vuelo con la misma identidad natural y otra clave de generación." });
  const warnings = [...validation.warnings, ...plan.warnings];
  return { schedule, validation, plan, warnings, blockingIssues, warningFingerprint: warningFingerprint(warnings.map(({ code }) => code)), expectedCreated: plan.candidates.length - inspected.existing.length, existing: inspected.existing.length, conflicts: inspected.conflicts.length };
}

export const previewSchedulePublication = (scheduleId: string, now = new Date()) => previewWithDb(prisma, scheduleId, now);

async function generateWithDb(db: Prisma.TransactionClient, schedule: LoadedSchedule, now: Date): Promise<FlightGenerationResult> {
  const plan = buildScheduleGenerationPlan({ schedule: scheduleShape(schedule), now });
  const identity = generationIdentity(scheduleShape(schedule));
  if (!identity || !schedule.route.departureAirport || !schedule.route.arrivalAirport) throw new SchedulePublicationError("ROUTE_FLIGHT_IDENTITY_MISSING", "La ruta no tiene identidad o aeropuertos válidos.");
  const inspected = await inspectPlan(db, schedule, plan);
  if (inspected.conflicts.length) throw new SchedulePublicationError("FLIGHT_NATURAL_KEY_CONFLICT", "Existe un vuelo incompatible con la generación solicitada.");
  const createdFlightIds: string[] = [];
  for (const candidate of plan.candidates) {
    if (inspected.existingKeys.has(candidate.generationKey)) continue;
    const flight = await db.flight.create({ data: { dataOrigin: AocDataOrigin.HISPAFLY_NATIVE, routeId: schedule.routeId, departureAirportId: schedule.route.departureAirportId, arrivalAirportId: schedule.route.arrivalAirportId, scheduleId: schedule.id, operatingDate: day(candidate.operatingDate), scheduledDeparture: candidate.scheduledDeparture, scheduledArrival: candidate.scheduledArrival, scheduledDurationMinutes: schedule.scheduledDurationMinutes, flightNumber: identity.flightNumber, callsign: identity.callsign, departureIcao: schedule.route.departureAirport.icao, arrivalIcao: schedule.route.arrivalAirport.icao, departureTimezone: candidate.departureTimezone, arrivalTimezone: candidate.arrivalTimezone, departureLocalTime: candidate.departureLocalTime, arrivalLocalTime: candidate.arrivalLocalTime, fleetId: schedule.defaultFleetId, assignedAircraftId: schedule.assignedAircraftId, status: candidate.status === "OPEN_FOR_BOOKING" ? NativeFlightStatus.OPEN_FOR_BOOKING : NativeFlightStatus.SCHEDULED, bookingOpenAt: candidate.bookingOpenAt, bookingCloseAt: candidate.bookingCloseAt, generationKey: candidate.generationKey, operatingType: "SCHEDULED" } });
    createdFlightIds.push(flight.id);
  }
  const skipReasons = plan.skipped.reduce<Record<string, number>>((result, item) => ({ ...result, [item.code]: (result[item.code] ?? 0) + 1 }), {});
  return { scheduleId: schedule.id, created: createdFlightIds.length, existing: inspected.existing.length, skipped: plan.skipped.length, conflicts: 0, createdFlightIds, existingFlightIds: inspected.existing.map(({ id }) => id), skipReasons, rangeStart: plan.rangeStart, rangeEnd: plan.rangeEnd };
}

export async function publishFlightSchedule(input: { scheduleId: string; warningFingerprint?: string; actor: StaffIdentity; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schedule-publish:${input.scheduleId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schedule-generation:${input.scheduleId}`}))`;
    const current = await tx.flightSchedule.findUnique({ where: { id: input.scheduleId }, include: scheduleInclude });
    if (!current) throw new SchedulePublicationError("SCHEDULE_NOT_FOUND", "La programación no existe.");
    if (current.status === "ACTIVE") return { schedule: current, alreadyPublished: true, generation: await generateWithDb(tx, current, now) };
    if (current.status !== "DRAFT") throw new SchedulePublicationError("SCHEDULE_NOT_DRAFT", "Solo se puede publicar una programación en borrador.");
    const preview = await previewWithDb(tx, input.scheduleId, now);
    if (preview.blockingIssues.length) throw new SchedulePublicationError(preview.blockingIssues[0].code, preview.blockingIssues.map(({ message }) => message).join(" "));
    if (preview.warnings.length && input.warningFingerprint !== preview.warningFingerprint) throw new SchedulePublicationError("WARNING_ACKNOWLEDGEMENT_REQUIRED", "Debes revisar y aceptar las advertencias actuales antes de publicar.");
    const generation = await generateWithDb(tx, current, now);
    const schedule = await tx.flightSchedule.update({ where: { id: input.scheduleId }, data: { status: "ACTIVE" } });
    await tx.aocAuditLog.create({ data: { staffUserId: actorId(input.actor), action: "SCHEDULE_PUBLISHED", entityType: "FlightSchedule", entityId: schedule.id, message: `${input.actor.name} publicó la programación ${schedule.code}.`, metadata: { scheduleId: schedule.id, routeId: schedule.routeId, effectiveFrom: schedule.effectiveFrom, effectiveUntil: schedule.effectiveUntil, daysOfWeek: schedule.daysOfWeek, generationHorizonDays: schedule.generationHorizonDays, warningCodes: preview.warnings.map(({ code }) => code), warningAcknowledgement: preview.warningFingerprint || null, initialGeneration: { created: generation.created, existing: generation.existing, skipped: generation.skipped, conflicts: generation.conflicts } } } });
    await tx.aocAuditLog.create({ data: { staffUserId: actorId(input.actor), action: "SCHEDULE_FLIGHTS_GENERATED", entityType: "FlightSchedule", entityId: schedule.id, message: `Se generaron ${generation.created} vuelos para ${schedule.code}.`, metadata: { rangeStart: generation.rangeStart, rangeEnd: generation.rangeEnd, created: generation.created, existing: generation.existing, skipped: generation.skipped, conflicts: generation.conflicts, createdFlightIds: generation.createdFlightIds.slice(0, 100), source: "STAFF_PUBLICATION" } } });
    return { schedule, alreadyPublished: false, generation };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function generateFlightsForSchedule(input: { scheduleId: string; actor: StaffIdentity; now?: Date }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schedule-generation:${input.scheduleId}`}))`;
    const schedule = await tx.flightSchedule.findUnique({ where: { id: input.scheduleId }, include: scheduleInclude });
    if (!schedule) throw new SchedulePublicationError("SCHEDULE_NOT_FOUND", "La programación no existe.");
    if (schedule.status !== "ACTIVE") throw new SchedulePublicationError("SCHEDULE_NOT_ACTIVE", "Solo se puede ampliar el horizonte de una programación ACTIVE.");
    const result = await generateWithDb(tx, schedule, now);
    await tx.aocAuditLog.create({ data: { staffUserId: actorId(input.actor), action: "SCHEDULE_FLIGHTS_GENERATED", entityType: "FlightSchedule", entityId: schedule.id, message: `${input.actor.name} actualizó el horizonte de ${schedule.code}: ${result.created} vuelos nuevos.`, metadata: { rangeStart: result.rangeStart, rangeEnd: result.rangeEnd, created: result.created, existing: result.existing, skipped: result.skipped, conflicts: result.conflicts, createdFlightIds: result.createdFlightIds.slice(0, 100), source: "STAFF_HORIZON_TOP_UP" } } });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function topUpActiveSchedules(input: { actor: StaffIdentity; take?: number; now?: Date }) {
  const rows = await prisma.flightSchedule.findMany({ where: { status: "ACTIVE" }, select: { id: true }, orderBy: { updatedAt: "asc" }, take: Math.min(Math.max(input.take ?? 25, 1), 100) });
  const results: Array<{ scheduleId: string; ok: boolean; result?: FlightGenerationResult; error?: string }> = [];
  for (const row of rows) try { results.push({ scheduleId: row.id, ok: true, result: await generateFlightsForSchedule({ scheduleId: row.id, actor: input.actor, now: input.now }) }); } catch (error) { results.push({ scheduleId: row.id, ok: false, error: error instanceof SchedulePublicationError ? error.code : "GENERATION_FAILED" }); }
  return results;
}
