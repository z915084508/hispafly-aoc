import { normalizeFlightIdentity } from "../dispatch/flightIdentity.ts";

function simBriefDate(value: Date) {
  const day = value.getUTCDate();
  const month = value.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = value.getUTCFullYear();
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} - ${hour}:${minute}`;
}

export function buildSimBriefGeneratePayload(input: {
  staticId: string;
  departureIcao: string;
  arrivalIcao: string;
  aircraftType: string | null;
  flightNumber: string | null;
  callsign: string | null;
  aircraftRegistration: string | null;
  selectedDepartureAt: Date;
  passengers: number | null;
  freightKg: number | null;
  cargoKg: number | null;
  userRoute: string | null;
  altitude: number | null;
}) {
  const identity = normalizeFlightIdentity({ flightNumber: input.flightNumber, callsign: input.callsign });
  if (!identity.numericFlightNumber || !identity.atcCallsign) throw new Error("A valid flight number and callsign are required for SimBrief.");
  return {
    static_id: input.staticId,
    orig: input.departureIcao.toUpperCase(),
    dest: input.arrivalIcao.toUpperCase(),
    type: input.aircraftType || "A320",
    airline: "HPF",
    fltnum: identity.numericFlightNumber,
    callsign: identity.atcCallsign,
    reg: input.aircraftRegistration || undefined,
    date: simBriefDate(input.selectedDepartureAt),
    pax: input.passengers ?? 0,
    cargo: input.freightKg ?? input.cargoKg ?? 0,
    route: input.userRoute || undefined,
    fl: input.altitude ?? undefined,
    planformat: "lido",
    units: "kgs",
    maps: 0,
    navlog: 1,
    stepclimbs: 1,
    tlr: 1,
    notams: 1,
    firnot: 0,
    etops: 0,
    taxiout: 20,
    taxiin: 8,
    contpct: 5,
    resvrule: 30,
  };
}
