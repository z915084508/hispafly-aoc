"use server";
import { AocDataOrigin, FlightScheduleStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { generateFlightsForSchedule } from "@/lib/native-flight/schedule";
import { isValidTimeZone } from "@/lib/native-flight/schedule-time";

const timeMinutes = (value: FormDataEntryValue | null) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};

export async function createScheduleAction(formData: FormData) {
  const staff = await requireStaffPermission("SCHEDULE_CREATE", { entityType: "FlightSchedule", attemptedAction: "create native schedule" });
  const routeId = String(formData.get("routeId") ?? "");
  const departureTimezone = String(formData.get("departureTimezone") ?? "");
  const arrivalTimezone = String(formData.get("arrivalTimezone") ?? "");
  const departureLocalTimeMinutes = timeMinutes(formData.get("departureTime"));
  const duration = Number(formData.get("duration"));
  const daysOfWeek = formData.getAll("daysOfWeek").map(Number);
  if (!routeId || !isValidTimeZone(departureTimezone) || !isValidTimeZone(arrivalTimezone) || departureLocalTimeMinutes < 0 || duration < 1 || !daysOfWeek.length) {
    redirect("/staff/schedules/new?error=Invalid+schedule+details");
  }
  const route = await prisma.route.findUnique({ where: { id: routeId }, include: { departureAirport: true, arrivalAirport: true } });
  if (!route) redirect("/staff/schedules/new?error=Route+not+found");
  const schedule = await prisma.flightSchedule.create({
    data: {
      dataOrigin: AocDataOrigin.HISPAFLY_NATIVE,
      routeId,
      code: String(formData.get("code") ?? "").trim().toUpperCase(),
      name: String(formData.get("name") ?? "").trim() || null,
      daysOfWeek,
      departureTimeMinutesUtc: departureLocalTimeMinutes,
      arrivalTimeMinutesUtc: (departureLocalTimeMinutes + duration) % 1440,
      departureLocalTimeMinutes,
      arrivalLocalTimeMinutes: (departureLocalTimeMinutes + duration) % 1440,
      departureTimezone,
      arrivalTimezone,
      scheduledDurationMinutes: duration,
      defaultFleetId: String(formData.get("defaultFleetId") ?? "") || null,
      effectiveFrom: new Date(`${String(formData.get("effectiveFrom"))}T00:00:00.000Z`),
      effectiveUntil: formData.get("effectiveUntil") ? new Date(`${String(formData.get("effectiveUntil"))}T00:00:00.000Z`) : null,
      generationHorizonDays: Number(formData.get("generationHorizonDays")) || 30,
      status: FlightScheduleStatus.DRAFT,
    },
  });
  await writeAuditLogSafely({ staffUserId: staff.id, action: "SCHEDULE_CREATED", entityType: "FlightSchedule", entityId: schedule.id, message: `${staff.name} created native schedule ${schedule.code}.` });
  redirect("/staff/schedules");
}

export async function activateAndGenerateAction(formData: FormData) {
  const staff = await requireStaffPermission("SCHEDULE_GENERATE", { entityType: "FlightSchedule", attemptedAction: "activate and generate schedule" });
  const scheduleId = String(formData.get("scheduleId"));
  const from = String(formData.get("from"));
  const to = String(formData.get("to"));
  await prisma.flightSchedule.update({ where: { id: scheduleId }, data: { status: FlightScheduleStatus.ACTIVE } });
  const result = await generateFlightsForSchedule(scheduleId, from, to);
  await writeAuditLogSafely({ staffUserId: staff.id, action: "SCHEDULE_FLIGHTS_GENERATED", entityType: "FlightSchedule", entityId: scheduleId, message: `${staff.name} generated ${result.created} native flights.`, metadata: result });
  redirect("/staff/flights");
}
