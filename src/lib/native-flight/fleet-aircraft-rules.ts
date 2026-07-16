import { normalizeCode, normalizeRegistration } from "./normalize.ts";

export function nonNegative(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative whole number.`);
  return value;
}
export function normalizeFleetInput(input: { code: string; type: string; iataType?: string | null }) {
  const type = input.type.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,4}$/.test(type)) throw new Error("ICAO aircraft type must contain 2 to 4 letters or digits.");
  const iataType = input.iataType?.trim().toUpperCase() || null;
  if (iataType && !/^[A-Z0-9]{2,3}$/.test(iataType)) throw new Error("IATA aircraft type is invalid.");
  return { code: normalizeCode(input.code, "Fleet code"), type, iataType };
}
export function normalizeAircraftInput(input: { registration: string; aircraftType: string; selcal?: string | null }) {
  const aircraftType = input.aircraftType.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,4}$/.test(aircraftType)) throw new Error("Aircraft type is invalid.");
  const selcal = input.selcal?.trim().toUpperCase() || null;
  if (selcal && !/^[A-Z]{2}-?[A-Z]{2}$/.test(selcal)) throw new Error("SELCAL is invalid.");
  return { registration: normalizeRegistration(input.registration), aircraftType, selcal };
}
export const ASSIGNABLE_AIRCRAFT_STATUSES = new Set(["AVAILABLE"]);
export const BLOCKING_AIRCRAFT_STATUSES = new Set(["RESERVED", "DISPATCHED", "IN_FLIGHT", "TURNAROUND", "MAINTENANCE", "AOG", "SUSPENDED", "RETIRED", "UNKNOWN"]);
