import type { ProgramacionAircraftOption, ProgramacionFleetOption, ProgramacionFormValue, ProgramacionRouteOption } from "@/components/programacion/types";
import { listScheduleFormOptions } from "./repository";

export const formatMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const formatDuration = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const formatDate = (date: Date | null) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date).toUpperCase() : "ABIERTO";
export const formatDays = (days: number[]) => days.map((day) => ["", "L", "M", "X", "J", "V", "S", "D"][day]).join(" ");
export const toProposedSchedule = (schedule: { id: string; routeId: string; daysOfWeek: number[]; departureTimeMinutesUtc: number; arrivalTimeMinutesUtc: number; scheduledDurationMinutes: number; defaultFleetId: string | null; assignedAircraftId: string | null; effectiveFrom: Date; effectiveUntil: Date | null }) => ({ scheduleId: schedule.id, routeId: schedule.routeId, daysOfWeek: schedule.daysOfWeek, departureTimeMinutesUtc: schedule.departureTimeMinutesUtc, arrivalTimeMinutesUtc: schedule.arrivalTimeMinutesUtc, scheduledDurationMinutes: schedule.scheduledDurationMinutes, defaultFleetId: schedule.defaultFleetId, assignedAircraftId: schedule.assignedAircraftId, effectiveFrom: schedule.effectiveFrom, effectiveUntil: schedule.effectiveUntil });
export const toFormValue = (schedule: { id: string; code: string; name: string | null; routeId: string; daysOfWeek: number[]; departureTimeMinutesUtc: number; scheduledDurationMinutes: number; defaultFleetId: string | null; assignedAircraftId: string | null; effectiveFrom: Date; effectiveUntil: Date | null; bookingOpenOffsetMinutes: number; bookingCloseOffsetMinutes: number; generationHorizonDays: number; notes: string | null }): ProgramacionFormValue => ({ ...schedule, effectiveFrom: schedule.effectiveFrom.toISOString().slice(0, 10), effectiveUntil: schedule.effectiveUntil?.toISOString().slice(0, 10) ?? "" });

export async function scheduleFormOptions(): Promise<{ routes: ProgramacionRouteOption[]; fleets: ProgramacionFleetOption[]; aircraft: ProgramacionAircraftOption[] }> {
  const [routes, fleets, aircraft] = await listScheduleFormOptions();
  return {
    routes: routes.map((route) => ({ id: route.id, label: `${route.flightNumber ?? route.routeCode ?? "RUTA"} · ${route.departure} → ${route.arrival}`, flightNumber: route.flightNumber, callsign: route.callsign, departure: route.departure, arrival: route.arrival, duration: route.scheduledDurationMinutes, defaultFleetId: route.defaultFleetId, compatibleFleetIds: route.fleetAssignments.map(({ fleetId }) => fleetId).filter((id) => !route.fleetCompatibility.some((item) => item.fleetId === id && item.policy === "FORBIDDEN")) })),
    fleets: fleets.map((fleet) => ({ id: fleet.id, label: fleet.code ?? fleet.name ?? fleet.id, status: fleet.operationalStatus })),
    aircraft: aircraft.map((item) => ({ id: item.id, registration: item.registration ?? item.name ?? item.id, type: item.aircraftType ?? "—", fleetId: item.nativeFleetId, status: item.conditionSnapshot?.operationalStatus ?? item.operationalStatus, airport: item.currentAirport?.icao ?? null })),
  };
}
