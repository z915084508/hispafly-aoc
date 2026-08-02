export type ScheduleDraftInput = {
  code: string; name: string | null; routeId: string; daysOfWeek: number[];
  departureTimeMinutesUtc: number; arrivalTimeMinutesUtc: number; scheduledDurationMinutes: number;
  defaultFleetId: string | null; assignedAircraftId: string | null;
  effectiveFrom: Date; effectiveUntil: Date | null;
  bookingOpenOffsetMinutes: number; bookingCloseOffsetMinutes: number; generationHorizonDays: number;
  notes: string | null;
};

export class ScheduleManagementError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = "ScheduleManagementError"; }
}

const dateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(Number.NaN);
const integer = (value: unknown) => typeof value === "number" ? value : Number(String(value ?? ""));

export function normalizeScheduleDraftInput(raw: Record<string, unknown>): ScheduleDraftInput {
  const code = String(raw.code ?? "").trim().toUpperCase(), routeId = String(raw.routeId ?? "").trim();
  const daysOfWeek = Array.isArray(raw.daysOfWeek) ? raw.daysOfWeek.map(integer) : [];
  const departureTimeMinutesUtc = integer(raw.departureTimeMinutesUtc), scheduledDurationMinutes = integer(raw.scheduledDurationMinutes);
  const arrivalTimeMinutesUtc = (departureTimeMinutesUtc + scheduledDurationMinutes) % 1440;
  const effectiveFrom = dateOnly(String(raw.effectiveFrom ?? ""));
  const effectiveUntilValue = String(raw.effectiveUntil ?? "").trim();
  const effectiveUntil = effectiveUntilValue ? dateOnly(effectiveUntilValue) : null;
  if (!code || code.length > 64) throw new ScheduleManagementError("INVALID_CODE", "El código es obligatorio y no puede superar 64 caracteres.");
  if (!routeId) throw new ScheduleManagementError("ROUTE_REQUIRED", "Selecciona una ruta.");
  if (!daysOfWeek.length) throw new ScheduleManagementError("NO_OPERATING_DAYS", "Selecciona al menos un día de operación.");
  if (daysOfWeek.some((day) => !Number.isInteger(day) || day < 1 || day > 7) || new Set(daysOfWeek).size !== daysOfWeek.length) throw new ScheduleManagementError("INVALID_OPERATING_DAY", "Los días de operación no son válidos.");
  if (!Number.isInteger(departureTimeMinutesUtc) || departureTimeMinutesUtc < 0 || departureTimeMinutesUtc > 1439) throw new ScheduleManagementError("INVALID_DEPARTURE_TIME", "La hora de salida UTC no es válida.");
  if (!Number.isInteger(scheduledDurationMinutes) || scheduledDurationMinutes < 1 || scheduledDurationMinutes > 1440) throw new ScheduleManagementError("INVALID_DURATION", "La duración debe estar entre 1 y 1440 minutos.");
  if (!Number.isFinite(effectiveFrom.getTime()) || (effectiveUntil && !Number.isFinite(effectiveUntil.getTime()))) throw new ScheduleManagementError("INVALID_EFFECTIVE_DATE", "Las fechas de vigencia no son válidas.");
  if (effectiveUntil && effectiveUntil < effectiveFrom) throw new ScheduleManagementError("INVALID_EFFECTIVE_PERIOD", "La fecha final no puede ser anterior a la fecha inicial.");
  const bookingOpenOffsetMinutes = integer(raw.bookingOpenOffsetMinutes ?? 10080), bookingCloseOffsetMinutes = integer(raw.bookingCloseOffsetMinutes ?? 60), generationHorizonDays = integer(raw.generationHorizonDays ?? 30);
  if (![bookingOpenOffsetMinutes, bookingCloseOffsetMinutes, generationHorizonDays].every(Number.isInteger) || bookingOpenOffsetMinutes < 0 || bookingCloseOffsetMinutes < 0 || generationHorizonDays < 1 || generationHorizonDays > 365) throw new ScheduleManagementError("INVALID_SETTINGS", "La configuración de reservas o generación no es válida.");
  return { code, name: String(raw.name ?? "").trim() || null, routeId, daysOfWeek: [...daysOfWeek].sort(), departureTimeMinutesUtc, arrivalTimeMinutesUtc, scheduledDurationMinutes, defaultFleetId: String(raw.defaultFleetId ?? "").trim() || null, assignedAircraftId: String(raw.assignedAircraftId ?? "").trim() || null, effectiveFrom, effectiveUntil, bookingOpenOffsetMinutes, bookingCloseOffsetMinutes, generationHorizonDays, notes: String(raw.notes ?? "").trim() || null };
}

export function assertDraftEditable(status: string) { if (status !== "DRAFT") throw new ScheduleManagementError("SCHEDULE_NOT_DRAFT", "Solo se pueden editar o archivar programaciones en borrador."); }
export function scheduleCreatePolicy() { return { status: "DRAFT" as const, dataOrigin: "HISPAFLY_NATIVE" as const }; }
