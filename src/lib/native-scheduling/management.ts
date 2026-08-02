import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import { validateProposedSchedule } from "./service";
import { assertDraftEditable, normalizeScheduleDraftInput, scheduleCreatePolicy, ScheduleManagementError, type ScheduleDraftInput } from "./management-rules";

const actorId = (actor: StaffIdentity) => actor.id === "development-staff" ? null : actor.id;
const proposed = (input: ScheduleDraftInput, scheduleId?: string) => ({ scheduleId, routeId: input.routeId, daysOfWeek: input.daysOfWeek, departureTimeMinutesUtc: input.departureTimeMinutesUtc, arrivalTimeMinutesUtc: input.arrivalTimeMinutesUtc, scheduledDurationMinutes: input.scheduledDurationMinutes, defaultFleetId: input.defaultFleetId, assignedAircraftId: input.assignedAircraftId, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, bookingOpenOffsetMinutes: input.bookingOpenOffsetMinutes, bookingCloseOffsetMinutes: input.bookingCloseOffsetMinutes, generationHorizonDays: input.generationHorizonDays });
const data = (input: ScheduleDraftInput) => ({ ...input, departureLocalTimeMinutes: input.departureTimeMinutesUtc, arrivalLocalTimeMinutes: input.arrivalTimeMinutesUtc, departureTimezone: "UTC", arrivalTimezone: "UTC" });

async function assertReferencesAndCode(input: ScheduleDraftInput, excludeId?: string) {
  const [route, fleet, aircraft, duplicate] = await Promise.all([prisma.route.findUnique({ where: { id: input.routeId }, select: { id: true } }), input.defaultFleetId ? prisma.fleet.findUnique({ where: { id: input.defaultFleetId }, select: { id: true } }) : null, input.assignedAircraftId ? prisma.aircraft.findUnique({ where: { id: input.assignedAircraftId }, select: { id: true } }) : null, prisma.flightSchedule.findFirst({ where: { code: input.code, id: excludeId ? { not: excludeId } : undefined }, select: { id: true } })]);
  if (!route) throw new ScheduleManagementError("ROUTE_NOT_FOUND", "La ruta seleccionada no existe.");
  if (input.defaultFleetId && !fleet) throw new ScheduleManagementError("FLEET_NOT_FOUND", "La flota seleccionada no existe.");
  if (input.assignedAircraftId && !aircraft) throw new ScheduleManagementError("AIRCRAFT_NOT_FOUND", "La aeronave seleccionada no existe.");
  if (duplicate) throw new ScheduleManagementError("DUPLICATE_CODE", "Ya existe una programación con este código.");
}

function cleanError(error: unknown) {
  if (error instanceof ScheduleManagementError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new ScheduleManagementError("DUPLICATE_SCHEDULE", "Ya existe una programación con esta identidad.");
  return new ScheduleManagementError("SAVE_FAILED", "No se pudo guardar la programación.");
}

export async function createFlightScheduleDraft(raw: Record<string, unknown>, actor: StaffIdentity) {
  try {
    const input = normalizeScheduleDraftInput(raw); await assertReferencesAndCode(input);
    const validationBeforeSave = await validateProposedSchedule(proposed(input));
    const schedule = await prisma.$transaction(async (tx) => {
      const created = await tx.flightSchedule.create({ data: { ...data(input), ...scheduleCreatePolicy() } });
      await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "SCHEDULE_DRAFT_CREATED", entityType: "FlightSchedule", entityId: created.id, message: `${actor.name} creó el borrador ${created.code}.`, metadata: { validation: { valid: validationBeforeSave.valid, errors: validationBeforeSave.errors.length, warnings: validationBeforeSave.warnings.length } } } });
      return created;
    });
    return { schedule, validation: await validateProposedSchedule(proposed(input, schedule.id), { excludeScheduleId: schedule.id }) };
  } catch (error) { throw cleanError(error); }
}

export async function updateFlightScheduleDraft(id: string, raw: Record<string, unknown>, actor: StaffIdentity) {
  try {
    const before = await prisma.flightSchedule.findUnique({ where: { id } }); if (!before) throw new ScheduleManagementError("NOT_FOUND", "La programación no existe."); assertDraftEditable(before.status);
    const input = normalizeScheduleDraftInput(raw); await assertReferencesAndCode(input, id);
    await validateProposedSchedule(proposed(input, id), { excludeScheduleId: id });
    const schedule = await prisma.$transaction(async (tx) => {
      const updated = await tx.flightSchedule.update({ where: { id }, data: data(input) });
      const changedFields = Object.keys(data(input)).filter((field) => String(before[field as keyof typeof before] ?? "") !== String(data(input)[field as keyof ReturnType<typeof data>] ?? ""));
      await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "SCHEDULE_DRAFT_UPDATED", entityType: "FlightSchedule", entityId: id, message: `${actor.name} actualizó el borrador ${updated.code}.`, metadata: { changedFields } } }); return updated;
    });
    return { schedule, validation: await validateProposedSchedule(proposed(input, id), { excludeScheduleId: id }) };
  } catch (error) { throw cleanError(error); }
}

export async function duplicateFlightScheduleAsDraft(id: string, raw: Record<string, unknown>, actor: StaffIdentity) {
  try {
    const source = await prisma.flightSchedule.findUnique({ where: { id } }); if (!source) throw new ScheduleManagementError("NOT_FOUND", "La programación original no existe.");
    const result = await createFlightScheduleDraft({ code: raw.code, name: source.name, routeId: source.routeId, daysOfWeek: source.daysOfWeek, departureTimeMinutesUtc: source.departureTimeMinutesUtc, scheduledDurationMinutes: source.scheduledDurationMinutes, defaultFleetId: source.defaultFleetId, assignedAircraftId: source.assignedAircraftId, effectiveFrom: raw.effectiveFrom, effectiveUntil: raw.effectiveUntil, bookingOpenOffsetMinutes: source.bookingOpenOffsetMinutes, bookingCloseOffsetMinutes: source.bookingCloseOffsetMinutes, generationHorizonDays: source.generationHorizonDays, notes: source.notes }, actor);
    await prisma.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "SCHEDULE_DRAFT_DUPLICATED", entityType: "FlightSchedule", entityId: result.schedule.id, message: `${actor.name} duplicó ${source.code} como ${result.schedule.code}.`, metadata: { sourceScheduleId: source.id } } });
    return result;
  } catch (error) { throw cleanError(error); }
}

export async function archiveFlightScheduleDraft(id: string, actor: StaffIdentity) {
  try {
    return await prisma.$transaction(async (tx) => { const before = await tx.flightSchedule.findUnique({ where: { id } }); if (!before) throw new ScheduleManagementError("NOT_FOUND", "La programación no existe."); assertDraftEditable(before.status); const schedule = await tx.flightSchedule.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } }); await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "SCHEDULE_DRAFT_ARCHIVED", entityType: "FlightSchedule", entityId: id, message: `${actor.name} archivó el borrador ${schedule.code}.` } }); return schedule; });
  } catch (error) { throw cleanError(error); }
}
