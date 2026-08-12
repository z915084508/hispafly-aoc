"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { archiveFlightScheduleDraft, createFlightScheduleDraft, createFlightScheduleDraftPair, duplicateFlightScheduleAsDraft, updateFlightScheduleDraft } from "@/lib/native-scheduling/management";
import { publishFlightSchedulesBatch } from "@/lib/native-scheduling/bulk-publication";
import { generateFlightsForSchedule, publishFlightSchedule, SchedulePublicationError } from "@/lib/native-scheduling/publication";
import { getFlightSchedule } from "@/lib/native-scheduling/repository";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const raw = (form: FormData) => ({ code: value(form, "code"), autoGenerateCode: value(form, "autoGenerateCode"), name: value(form, "name"), routeId: value(form, "routeId"), daysOfWeek: form.getAll("daysOfWeek").map(Number), departureTimeMinutesUtc: Number(value(form, "departureTimeMinutesUtc")), scheduledDurationMinutes: Number(value(form, "scheduledDurationMinutes")), defaultFleetId: value(form, "defaultFleetId"), assignedAircraftId: value(form, "assignedAircraftId"), effectiveFrom: value(form, "effectiveFrom"), effectiveUntil: value(form, "effectiveUntil"), bookingOpenOffsetMinutes: Number(value(form, "bookingOpenOffsetMinutes")), bookingCloseOffsetMinutes: Number(value(form, "bookingCloseOffsetMinutes")), generationHorizonDays: Number(value(form, "generationHorizonDays")), notes: value(form, "notes") });
const plainMessage = (error: unknown) => error instanceof SchedulePublicationError ? error.message : error instanceof Error ? error.message : "No se pudo completar la operación.";
const message = (error: unknown) => encodeURIComponent(plainMessage(error));
const workspace = (form: FormData, scheduleId?: string) => { const requested = value(form, "returnTo"); if (requested.includes("//") || (!requested.startsWith("/staff/operations/programacion?") && !requested.startsWith("/staff/operations/airport-programacion?"))) return null; const url = new URL(requested, "https://aoc.local"); url.searchParams.delete("panel"); url.searchParams.delete("mode"); if (scheduleId) url.searchParams.set(url.pathname.endsWith("airport-programacion") ? "createdScheduleId" : "scheduleId", scheduleId); url.searchParams.set("saved", "1"); return `${url.pathname}?${url.searchParams.toString()}`; };
const addParams = (target: string, values: Record<string, string>) => { const url = new URL(target, "https://aoc.local"); for (const [key, entry] of Object.entries(values)) url.searchParams.set(key, entry); return `${url.pathname}?${url.searchParams.toString()}`; };
const publicationTarget = (form: FormData) => { const requested = value(form, "returnTo"); return requested.startsWith("/staff/operations/programacion?") && !requested.includes("//") ? requested : "/staff/operations/programacion?view=publication"; };

export async function createProgramacionAction(form: FormData) {
  let target = "/staff/operations/programacion/new";
  try {
    const staff = await requireStaffPermission("SCHEDULE_CREATE", { entityType: "FlightSchedule", attemptedAction: "create Programación draft" });
    if (value(form, "createReturn") === "yes") {
      const result = await createFlightScheduleDraftPair(raw(form), {
        code: value(form, "returnCode"),
        autoGenerateCode: value(form, "autoGenerateReturnCode"),
        routeId: value(form, "returnRouteId"),
        turnaroundMinutes: Number(value(form, "returnTurnaroundMinutes")),
      }, staff);
      target = workspace(form, result.outboundSchedule.id) ?? `/staff/operations/programacion/${result.outboundSchedule.id}?saved=1`;
      target = addParams(target, {
        returnCreated: "1",
        returnScheduleId: result.returnSchedule.id,
        errors: String(result.outboundValidation.errors.length + result.returnValidation.errors.length),
        warnings: String(result.outboundValidation.warnings.length + result.returnValidation.warnings.length),
      });
    } else {
      const { schedule, validation } = await createFlightScheduleDraft(raw(form), staff);
      target = workspace(form, schedule.id) ?? `/staff/operations/programacion/${schedule.id}?saved=1&errors=${validation.errors.length}&warnings=${validation.warnings.length}`;
    }
    revalidatePath("/staff/operations/programacion");
  } catch (error) {
    const returnTo = value(form, "returnTo");
    target = returnTo.startsWith("/staff/operations/programacion?") ? `${returnTo}&error=${message(error)}` : `${target}?error=${message(error)}`;
  }
  redirect(target);
}

export async function updateProgramacionAction(form: FormData) { const id = value(form, "id"); let target = `/staff/operations/programacion/${id}/edit`; try { const staff = await requireStaffPermission("SCHEDULE_EDIT", { entityType: "FlightSchedule", entityId: id, attemptedAction: "edit Programación draft" }); const { validation } = await updateFlightScheduleDraft(id, raw(form), staff); target = workspace(form, id) ?? `/staff/operations/programacion/${id}?saved=1&errors=${validation.errors.length}&warnings=${validation.warnings.length}`; revalidatePath("/staff/operations/programacion"); } catch (error) { const returnTo=value(form,"returnTo"); target = returnTo.startsWith("/staff/operations/programacion?") ? `${returnTo}&error=${message(error)}` : `${target}?error=${message(error)}`; } redirect(target); }
export async function duplicateProgramacionAction(form: FormData) { const id = value(form, "id"); let target = `/staff/operations/programacion/${id}`; try { const staff = await requireStaffPermission("SCHEDULE_CREATE", { entityType: "FlightSchedule", entityId: id, attemptedAction: "duplicate Programación draft" }); const { schedule } = await duplicateFlightScheduleAsDraft(id, { code: value(form, "code"), effectiveFrom: value(form, "effectiveFrom"), effectiveUntil: value(form, "effectiveUntil") }, staff); target = `/staff/operations/programacion/${schedule.id}?duplicated=1`; revalidatePath("/staff/operations/programacion"); } catch (error) { target += `?error=${message(error)}`; } redirect(target); }
export async function archiveProgramacionAction(form: FormData) { const id = value(form, "id"); let target = `/staff/operations/programacion/${id}`; try { const staff = await requireStaffPermission("SCHEDULE_STATUS_MANAGE", { entityType: "FlightSchedule", entityId: id, attemptedAction: "archive Programación draft" }); await archiveFlightScheduleDraft(id, staff); target = "/staff/operations/programacion?archived=1"; revalidatePath("/staff/operations/programacion"); } catch (error) { target += `?error=${message(error)}`; } redirect(target); }
export async function publishProgramacionAction(form: FormData) { const id = value(form, "id"); let target = `/staff/operations/programacion/${id}`; try { const staff = await requireStaffPermission("SCHEDULE_STATUS_MANAGE", { entityType: "FlightSchedule", entityId: id, attemptedAction: "publish Programación" }); const result = await publishFlightSchedule({ scheduleId: id, warningFingerprint: value(form, "acknowledged") === "yes" ? value(form, "warningFingerprint") : undefined, actor: staff }); target += `?published=1&created=${result.generation.created}&existing=${result.generation.existing}`; revalidatePath("/staff/operations/programacion"); revalidatePath(`/staff/operations/programacion/${id}`); revalidatePath("/pilot/flight-offers"); } catch (error) { target += `?error=${message(error)}`; } redirect(target); }

export async function bulkPublishProgramacionAction(form: FormData) {
  let target = publicationTarget(form);
  try {
    const staff = await requireStaffPermission("SCHEDULE_STATUS_MANAGE", { entityType: "FlightSchedule", attemptedAction: "bulk publish Programación drafts" });
    const scheduleIds = form.getAll("scheduleId").map((entry) => String(entry).trim()).filter(Boolean);
    const warningFingerprints = Object.fromEntries(scheduleIds.map((id) => [id, value(form, `warningFingerprint:${id}`) || undefined]));
    const result = await publishFlightSchedulesBatch({
      scheduleIds,
      mode: value(form, "batchMode") === "ready" ? "READY_ONLY" : "SELECTED",
      acknowledgeWarnings: value(form, "acknowledgeWarnings") === "yes",
      warningFingerprints,
      actor: staff,
    });
    const failures = result.items.filter(({ status }) => !["PUBLISHED", "ALREADY_PUBLISHED"].includes(status)).slice(0, 15).map(({ code, errorCode, message: failureMessage }) => ({ code, errorCode, message: failureMessage }));
    target = addParams(target, {
      batchRequested: String(result.requested),
      batchPublished: String(result.published),
      batchAlreadyPublished: String(result.alreadyPublished),
      batchCreated: String(result.createdFlights),
      batchExisting: String(result.existingFlights),
      batchFailed: String(result.failed),
      batchFailures: JSON.stringify(failures),
    });
    revalidatePath("/staff/operations/programacion");
    revalidatePath("/pilot/flight-offers");
  } catch (error) {
    target = addParams(target, { error: plainMessage(error) });
  }
  redirect(target);
}

export async function generateProgramacionFlightsAction(form: FormData) { const id = value(form, "id"); let target = `/staff/operations/programacion/${id}`; try { const staff = await requireStaffPermission("SCHEDULE_STATUS_MANAGE", { entityType: "FlightSchedule", entityId: id, attemptedAction: "extend Programación horizon" }); const result = await generateFlightsForSchedule({ scheduleId: id, actor: staff }); target += `?generated=1&created=${result.created}&existing=${result.existing}`; revalidatePath(`/staff/operations/programacion/${id}`); revalidatePath("/pilot/flight-offers"); } catch (error) { target += `?error=${message(error)}`; } redirect(target); }
export async function applyPlannerDaysAction(form: FormData) { const id=value(form,"id"), aircraftId=value(form,"aircraftId"), week=value(form,"week"); let target=`/staff/operations/programacion/planner?aircraftId=${encodeURIComponent(aircraftId)}&week=${encodeURIComponent(week)}`; try { const staff=await requireStaffPermission("SCHEDULE_EDIT",{entityType:"FlightSchedule",entityId:id,attemptedAction:"apply planner operating days"}); const schedule=await getFlightSchedule(id); if(!schedule) throw new Error("La programación no existe."); await updateFlightScheduleDraft(id,{code:schedule.code,name:schedule.name,routeId:schedule.routeId,daysOfWeek:form.getAll("daysOfWeek").map(Number),departureTimeMinutesUtc:schedule.departureTimeMinutesUtc,scheduledDurationMinutes:schedule.scheduledDurationMinutes,defaultFleetId:schedule.defaultFleetId,assignedAircraftId:schedule.assignedAircraftId,effectiveFrom:schedule.effectiveFrom.toISOString().slice(0,10),effectiveUntil:schedule.effectiveUntil?.toISOString().slice(0,10)??"",bookingOpenOffsetMinutes:schedule.bookingOpenOffsetMinutes,bookingCloseOffsetMinutes:schedule.bookingCloseOffsetMinutes,generationHorizonDays:schedule.generationHorizonDays,notes:schedule.notes},staff); revalidatePath("/staff/operations/programacion/planner"); target+=`&selected=${id}&daysApplied=1`; } catch(error){ target+=`&error=${message(error)}`; } redirect(target); }
