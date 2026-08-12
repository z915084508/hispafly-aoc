import { DEFAULT_MIN_TURNAROUND_MINUTES } from "./constants.ts";
import { ScheduleManagementError, type ScheduleDraftInput } from "./management-rules.ts";

export type ReturnScheduleDraftRequest = {
  code: unknown;
  autoGenerateCode?: unknown;
  routeId: unknown;
  turnaroundMinutes: unknown;
  scheduledDurationMinutes: unknown;
};

const integer = (value: unknown) => typeof value === "number" ? value : Number(String(value ?? ""));
const shiftDays = (days: number[], offset: number) => days.map((day) => ((day - 1 + offset) % 7) + 1).sort();

export function deriveReturnScheduleDraft(outbound: ScheduleDraftInput, request: ReturnScheduleDraftRequest): ScheduleDraftInput {
  const code = String(request.code ?? "").trim().toUpperCase();
  const routeId = String(request.routeId ?? "").trim();
  const turnaroundMinutes = integer(request.turnaroundMinutes);
  const scheduledDurationMinutes = integer(request.scheduledDurationMinutes);

  if (!code || code.length > 64) throw new ScheduleManagementError("INVALID_RETURN_CODE", "El código del regreso es obligatorio y no puede superar 64 caracteres.");
  if (code === outbound.code) throw new ScheduleManagementError("DUPLICATE_RETURN_CODE", "La ida y el regreso deben tener códigos diferentes.");
  if (!routeId) throw new ScheduleManagementError("RETURN_ROUTE_REQUIRED", "Selecciona una ruta de regreso.");
  if (!Number.isInteger(turnaroundMinutes) || turnaroundMinutes < DEFAULT_MIN_TURNAROUND_MINUTES || turnaroundMinutes > 1440) throw new ScheduleManagementError("INVALID_RETURN_TURNAROUND", `El turnaround del regreso debe estar entre ${DEFAULT_MIN_TURNAROUND_MINUTES} y 1440 minutos.`);
  if (!Number.isInteger(scheduledDurationMinutes) || scheduledDurationMinutes < 1 || scheduledDurationMinutes > 1440) throw new ScheduleManagementError("INVALID_RETURN_DURATION", "La ruta de regreso debe tener una duración válida.");

  const absoluteDeparture = outbound.departureTimeMinutesUtc + outbound.scheduledDurationMinutes + turnaroundMinutes;
  const dayOffset = Math.floor(absoluteDeparture / 1440);
  const departureTimeMinutesUtc = absoluteDeparture % 1440;

  return {
    ...outbound,
    code,
    name: outbound.name ? `${outbound.name} · Regreso` : null,
    routeId,
    daysOfWeek: shiftDays(outbound.daysOfWeek, dayOffset),
    departureTimeMinutesUtc,
    arrivalTimeMinutesUtc: (departureTimeMinutesUtc + scheduledDurationMinutes) % 1440,
    scheduledDurationMinutes,
  };
}
