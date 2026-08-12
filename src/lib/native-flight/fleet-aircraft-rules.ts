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
  const rawSelcal = input.selcal?.trim().toUpperCase().replace("-", "") || null;
  const selcalLetters = "ABCDEFGHJKLMNPQRS";
  if (rawSelcal) {
    if (rawSelcal.length !== 4 || [...rawSelcal].some((letter) => !selcalLetters.includes(letter))) throw new Error("SELCAL must use four valid ICAO characters (A-S, excluding I, N and O).");
    if (new Set(rawSelcal).size !== 4) throw new Error("SELCAL cannot repeat a character.");
    if (selcalLetters.indexOf(rawSelcal[0]) >= selcalLetters.indexOf(rawSelcal[1]) || selcalLetters.indexOf(rawSelcal[2]) >= selcalLetters.indexOf(rawSelcal[3])) throw new Error("Each SELCAL pair must place the lower character first.");
  }
  const selcal = rawSelcal ? `${rawSelcal.slice(0, 2)}-${rawSelcal.slice(2)}` : null;
  return { registration: normalizeRegistration(input.registration), aircraftType, selcal };
}
export const ASSIGNABLE_AIRCRAFT_STATUSES = new Set(["AVAILABLE"]);
export const BLOCKING_AIRCRAFT_STATUSES = new Set(["RESERVED", "DISPATCHED", "IN_FLIGHT", "TURNAROUND", "MAINTENANCE", "AOG", "SUSPENDED", "RETIRED", "UNKNOWN"]);
