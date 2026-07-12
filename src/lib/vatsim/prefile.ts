type JsonRecord = Record<string, unknown>;

export interface VatsimPrefileFallbacks {
  callsign?: string | null;
  aircraftType?: string | null;
  aircraftRegistration?: string | null;
  departureIcao?: string | null;
  arrivalIcao?: string | null;
  route?: string | null;
  altitude?: number | null;
  departureAt?: Date | null;
}

export interface VatsimPrefileResult {
  url: string | null;
  missing: string[];
  fields: Record<string, string>;
}

const record = (value: unknown): JsonRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : null;

function valueAt(root: JsonRecord | null, ...paths: string[][]) {
  for (const path of paths) {
    let value: unknown = root;
    for (const key of path) value = record(value)?.[key];
    const result = text(value);
    if (result) return result;
  }
  return null;
}

function upper(value: string | null | undefined) {
  return value?.trim().toUpperCase() || null;
}

function hhmmFromDate(value: Date | null | undefined) {
  if (!value || Number.isNaN(value.getTime())) return null;
  return `${String(value.getUTCHours()).padStart(2, "0")}${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function durationParts(value: string | null) {
  if (!value) return null;
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    const [hours, minutes] = value.split(":").map(Number);
    return { hours, minutes };
  }
  if (/^0\d{3}$/.test(value) && Number(value.slice(-2)) < 60) {
    return { hours: Number(value.slice(0, -2)), minutes: Number(value.slice(-2)) };
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const totalMinutes = Math.round(seconds / 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

function fuelEndurance(root: JsonRecord | null) {
  const direct = durationParts(valueAt(root, ["times", "endurance"], ["fuel", "endurance"], ["general", "endurance"]));
  if (direct) return direct;
  const ramp = Number(valueAt(root, ["fuel", "plan_ramp"], ["fuel", "block"]));
  const flow = Number(valueAt(root, ["fuel", "avg_fuel_flow"], ["fuel", "average_fuel_flow"]));
  if (!Number.isFinite(ramp) || !Number.isFinite(flow) || ramp <= 0 || flow <= 0) return null;
  const totalMinutes = Math.round(ramp / flow * 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

function aircraftField(root: JsonRecord | null, fallback: VatsimPrefileFallbacks) {
  const complete = upper(valueAt(root, ["aircraft", "icao_code"], ["aircraft", "icao_equipment"]));
  if (complete) return complete;
  const type = upper(valueAt(root, ["aircraft", "icaocode"], ["aircraft", "type"]) ?? fallback.aircraftType);
  const equipment = upper(valueAt(root, ["aircraft", "equip"], ["aircraft", "equipment"]));
  const transponder = upper(valueAt(root, ["aircraft", "transponder"]));
  return type ? `${type}${equipment ? `/${equipment}${transponder ? `/${transponder}` : ""}` : ""}` : null;
}

/** Builds VATSIM's documented backwards-compatible prefile form URL. */
export function buildVatsimPrefile(snapshot: unknown, fallback: VatsimPrefileFallbacks): VatsimPrefileResult {
  const root = record(snapshot);
  const callsign = upper(valueAt(root, ["general", "callsign"], ["params", "callsign"]) ?? fallback.callsign);
  const aircraft = aircraftField(root, fallback);
  const departure = upper(valueAt(root, ["origin", "icao_code"], ["params", "orig"]) ?? fallback.departureIcao);
  const arrival = upper(valueAt(root, ["destination", "icao_code"], ["params", "dest"]) ?? fallback.arrivalIcao);
  const alternate = upper(valueAt(root, ["alternate", "icao_code"], ["general", "alternate_icao"], ["params", "altn"]));
  const route = upper(valueAt(root, ["general", "route_ifps"], ["general", "route"], ["params", "route"]) ?? fallback.route);
  const speed = valueAt(root, ["general", "cruise_tas"], ["general", "avg_tas"], ["params", "cruise_speed"]);
  const altitude = valueAt(root, ["general", "initial_altitude"], ["params", "fl"], ["params", "altitude"]) ?? (fallback.altitude ? String(fallback.altitude < 1000 ? fallback.altitude * 100 : fallback.altitude) : null);
  const departureTime = valueAt(root, ["times", "sched_out_hhmm"], ["params", "deptime"]) ?? hhmmFromDate(fallback.departureAt);
  const enroute = durationParts(valueAt(root, ["times", "est_time_enroute"], ["times", "sched_time_enroute"], ["general", "air_time"]));
  const endurance = fuelEndurance(root);
  const registration = upper(valueAt(root, ["aircraft", "reg"], ["params", "reg"]) ?? fallback.aircraftRegistration);
  const remarksBase = valueAt(root, ["general", "dx_rmk"], ["general", "sys_rmk"], ["params", "remarks"]) ?? "";
  const remarks = [remarksBase, registration && !remarksBase.toUpperCase().includes("REG/") ? `REG/${registration.replace(/[^A-Z0-9]/g, "")}` : null, "OPR/HISPAFLY"].filter(Boolean).join(" ").trim();

  const required: Array<[string, string | null | undefined]> = [
    ["callsign", callsign], ["aircraft", aircraft], ["departure airport", departure], ["arrival airport", arrival],
    ["departure time", departureTime], ["cruise speed", speed], ["cruise altitude", altitude], ["route", route],
    ["estimated en-route time", enroute ? "ok" : null], ["fuel endurance", endurance ? "ok" : null],
  ];
  const missing = required.filter(([, value]) => !value).map(([label]) => label);
  const fields: Record<string, string> = {};
  if (callsign) fields["2"] = callsign;
  if (aircraft) fields["3"] = aircraft;
  if (speed) fields["4"] = String(Math.round(Number(speed))).padStart(3, "0");
  if (departure) fields["5"] = departure;
  if (departureTime) fields["6"] = departureTime.replace(":", "");
  if (altitude) fields["7"] = altitude.replace(/^FL/i, "");
  if (route) fields["8"] = route;
  if (arrival) fields["9"] = arrival;
  if (enroute) { fields["10a"] = String(enroute.hours).padStart(2, "0"); fields["10b"] = String(enroute.minutes).padStart(2, "0"); }
  fields["11"] = remarks;
  if (endurance) { fields["12a"] = String(endurance.hours).padStart(2, "0"); fields["12b"] = String(endurance.minutes).padStart(2, "0"); }
  if (alternate) fields["13"] = alternate;
  fields["1"] = "I";
  fields.voice = "/V/";

  if (missing.length) return { url: null, missing, fields };
  const query = new URLSearchParams({ raw: "?1=I", ...fields });
  return { url: `https://my.vatsim.net/pilots/flightplan?${query}`, missing, fields };
}
