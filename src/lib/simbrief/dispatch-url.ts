import { normalizeFlightIdentity } from "../dispatch/flightIdentity.ts";
import { mapAmnAircraftData, type AmnAircraftPerformance } from "./aircraft-data.ts";

export function simbriefDispatchUrl(input: {
  staticId: string; airline?: string | null; flightNumber?: string | null; callsign?: string | null; simbriefUserId?: string | null; aircraftType?: string | null;
  registration?: string | null; departure: string; arrival: string; passengers?: number | null;
  luggageKg?: number | null; altitude?: number | null; route?: string | null; costIndex?: number | null;
  fuelBiasPercent?: number | null; performanceProfile: AmnAircraftPerformance | null | undefined; seatCapacity?: number | null;
}) {
  const identity = normalizeFlightIdentity({ flightNumber: input.flightNumber, callsign: input.callsign, airlineName: input.airline ?? "HISPAFLY" });
  const query = new URLSearchParams({ orig: input.departure, dest: input.arrival, type: input.aircraftType ?? "A320", units: "KGS", static_id: input.staticId, airline: identity.airlineName });
  if (identity.numericFlightNumber) query.set("fltnum", identity.numericFlightNumber);
  if (identity.atcCallsign) query.set("callsign", identity.atcCallsign);
  if (identity.commercialFlightNumber) query.set("flight_number", identity.commercialFlightNumber);
  if (input.simbriefUserId) query.set("userid", input.simbriefUserId);
  if (input.registration) query.set("reg", input.registration);
  if (input.passengers !== null && input.passengers !== undefined) query.set("pax", String(input.passengers));
  if (input.luggageKg !== null && input.luggageKg !== undefined) query.set("cargo", String(input.luggageKg / 1000));
  if (input.altitude) query.set("fl", String(input.altitude));
  if (input.route) query.set("route", input.route);
  if (input.costIndex !== null && input.costIndex !== undefined) query.set("civalue", String(input.costIndex));
  if (input.fuelBiasPercent) query.set("fuelfactor", `${input.fuelBiasPercent > 0 ? "P" : "M"}${String(Math.abs(Math.round(input.fuelBiasPercent))).padStart(2, "0")}`);
  query.set("acdata", JSON.stringify(mapAmnAircraftData(input.performanceProfile, input.seatCapacity)));
  return `https://www.simbrief.com/system/dispatch.php?${query}`;
}

