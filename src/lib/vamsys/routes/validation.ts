import type { RouteFormInput } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optionalInt = (form: FormData, key: string) => { const value = text(form, key); if (!value) return undefined; const number = Number(value); if (!Number.isInteger(number) || number < 0) throw new Error(`${key} must be a positive integer.`); return number; };

export function validateRouteForm(form: FormData): RouteFormInput {
  const departureIcao = text(form, "departureIcao").toUpperCase();
  const arrivalIcao = text(form, "arrivalIcao").toUpperCase();
  const callsign = text(form, "callsign").toUpperCase();
  const flightNumber = text(form, "flightNumber").toUpperCase();
  if (!/^[A-Z]{4}$/.test(departureIcao) || !/^[A-Z]{4}$/.test(arrivalIcao)) throw new Error("Invalid departure or arrival ICAO.");
  if (departureIcao === arrivalIcao) throw new Error("Departure and arrival must be different.");
  if (!/^[A-Z0-9]{4,7}$/.test(callsign)) throw new Error("Callsign must contain 4-7 letters or numbers.");
  if (!/^[A-Z0-9]{3,6}$/.test(flightNumber)) throw new Error("Flight number must contain 3-6 letters or numbers.");
  const costIndex = text(form, "costIndex").toUpperCase();
  if (costIndex && costIndex !== "AUTO" && (!/^\d{1,3}$/.test(costIndex) || Number(costIndex) > 999)) throw new Error("Cost index must be AUTO or a number from 0 to 999.");
  const fleetIds = form.getAll("fleetIds").map(String).filter(Boolean);
  if (!fleetIds.length && text(form, "type") !== "jumpseat") throw new Error("Select at least one fleet.");
  return { localId: text(form, "id") || undefined, type: text(form, "type") || "scheduled", callsign, flightNumber, departureIcao, arrivalIcao, departureTime: text(form, "departureTime") || undefined, arrivalTime: text(form, "arrivalTime") || undefined, durationMinutes: optionalInt(form, "durationMinutes"), distanceNm: optionalInt(form, "distanceNm"), altitude: optionalInt(form, "altitude"), costIndex: costIndex || undefined, route: text(form, "route") || undefined, hidden: form.get("hidden") === "on", remarks: text(form, "remarks") || undefined, internalNotes: text(form, "internalNotes") || undefined, fleetIds };
}
