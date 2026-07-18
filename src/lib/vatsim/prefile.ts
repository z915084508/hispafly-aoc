type JsonRecord = Record<string, unknown>;

type DurationParts = { hours: number; minutes: number };

export interface VatsimPrefileFallbacks {
  callsign?: string | null;
  aircraftType?: string | null;
  aircraftRegistration?: string | null;
  departureIcao?: string | null;
  arrivalIcao?: string | null;
  route?: string | null;
  altitude?: number | null;
  departureAt?: Date | null;
  estimatedArrivalAt?: Date | null;
  estimatedDurationMinutes?: number | null;
}

export interface VatsimPrefileResult {
  url: string | null;
  missing: string[];
  fields: Record<string, string>;
  icaoText: string;
}

const record = (value: unknown): JsonRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : null;

function rawAt(root: JsonRecord | null, path: string[]) {
  let value: unknown = root;
  for (const key of path) value = record(value)?.[key];
  return value;
}

function valueAt(root: JsonRecord | null, ...paths: string[][]) {
  for (const path of paths) {
    const result = text(rawAt(root, path));
    if (result) return result;
  }
  return null;
}

function upper(value: string | null | undefined) {
  return value?.trim().toUpperCase() || null;
}

function alternateIcao(root: JsonRecord | null) {
  const direct = upper(valueAt(root,
    ["alternate", "icao_code"], ["alternate", "icao"], ["alternate", "ident"],
    ["general", "alternate_icao"], ["general", "altn_icao"], ["general", "alternate"], ["params", "altn"]));
  if (direct) return direct;
  for (const key of ["alternates", "alternate"]) {
    const candidates = root?.[key];
    if (!Array.isArray(candidates)) continue;
    for (const candidate of candidates) {
      const item = record(candidate);
      const value = upper(valueAt(item, ["icao_code"], ["icao"], ["ident"], ["airport", "icao_code"]));
      if (value) return value;
    }
  }
  return null;
}

function hhmmFromDate(value: Date | null | undefined) {
  if (!value || Number.isNaN(value.getTime())) return null;
  return `${String(value.getUTCHours()).padStart(2, "0")}${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function durationFromMinutes(value: number): DurationParts | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const totalMinutes = Math.max(1, Math.round(value));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

function durationParts(value: unknown): DurationParts | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") return durationFromMinutes(value / 60);

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return null;

    const clock = normalized.match(/^(\d{1,3}):([0-5]\d)(?::([0-5]\d(?:\.\d+)?))?$/);
    if (clock) return durationFromMinutes(Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3] ?? 0) / 60);

    if (/^0\d{3}$/.test(normalized)) {
      return durationFromMinutes(Number(normalized.slice(0, -2)) * 60 + Number(normalized.slice(-2)));
    }

    const iso = normalized.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/);
    if (iso && (iso[1] || iso[2] || iso[3])) return durationFromMinutes(Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0) + Number(iso[3] ?? 0) / 60);

    const labelled = normalized.match(/^(?:(\d+(?:\.\d+)?)\s*H(?:OURS?)?)?\s*(?:(\d+(?:\.\d+)?)\s*M(?:IN(?:UTES?)?)?)?\s*(?:(\d+(?:\.\d+)?)\s*S(?:EC(?:ONDS?)?)?)?$/);
    if (labelled && (labelled[1] || labelled[2] || labelled[3])) return durationFromMinutes(Number(labelled[1] ?? 0) * 60 + Number(labelled[2] ?? 0) + Number(labelled[3] ?? 0) / 60);

    const seconds = finiteNumber(normalized);
    return seconds === null ? null : durationFromMinutes(seconds / 60);
  }

  const object = record(value);
  if (!object) return null;

  for (const key of ["total_seconds", "totalSeconds", "duration_seconds", "durationSeconds", "seconds_total"]) {
    const seconds = finiteNumber(object[key]);
    if (seconds !== null) return durationFromMinutes(seconds / 60);
  }
  for (const key of ["total_minutes", "totalMinutes", "duration_minutes", "durationMinutes", "minutes_total"]) {
    const minutes = finiteNumber(object[key]);
    if (minutes !== null) return durationFromMinutes(minutes);
  }

  const hours = finiteNumber(object.hours ?? object.hour ?? object.hrs ?? object.hr ?? object.h);
  const minutes = finiteNumber(object.minutes ?? object.minute ?? object.mins ?? object.min ?? object.m);
  const seconds = finiteNumber(object.seconds ?? object.second ?? object.secs ?? object.sec ?? object.s);
  if (hours !== null || minutes !== null || seconds !== null) {
    return durationFromMinutes((hours ?? 0) * 60 + (minutes ?? 0) + (seconds ?? 0) / 60);
  }

  for (const key of ["value", "duration", "formatted", "text"]) {
    const parsed = durationParts(object[key]);
    if (parsed) return parsed;
  }
  return null;
}

function durationAt(root: JsonRecord | null, ...paths: string[][]) {
  for (const path of paths) {
    const parsed = durationParts(rawAt(root, path));
    if (parsed) return parsed;
  }
  return null;
}

function fallbackEnroute(fallback: VatsimPrefileFallbacks) {
  const direct = durationFromMinutes(Number(fallback.estimatedDurationMinutes));
  if (direct) return direct;
  const departure = fallback.departureAt;
  const arrival = fallback.estimatedArrivalAt;
  if (!departure || !arrival || Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime())) return null;
  return durationFromMinutes((arrival.getTime() - departure.getTime()) / 60_000);
}

function fuelEndurance(root: JsonRecord | null) {
  const direct = durationAt(root,
    ["times", "endurance"], ["times", "fuel_endurance"], ["fuel", "endurance"],
    ["fuel", "fuel_endurance"], ["general", "endurance"], ["general", "fuel_endurance"]);
  if (direct) return direct;
  const ramp = Number(valueAt(root, ["fuel", "plan_ramp"], ["fuel", "block"]));
  const flow = Number(valueAt(root, ["fuel", "avg_fuel_flow"], ["fuel", "average_fuel_flow"]));
  if (!Number.isFinite(ramp) || !Number.isFinite(flow) || ramp <= 0 || flow <= 0) return null;
  return durationFromMinutes(ramp / flow * 60);
}

function aircraftField(root: JsonRecord | null, fallback: VatsimPrefileFallbacks) {
  const complete = upper(valueAt(root, ["aircraft", "icao_equipment"]));
  if (complete?.includes("/")) return complete;
  const icaoCode = upper(valueAt(root, ["aircraft", "icao_code"]));
  if (icaoCode?.includes("/")) return icaoCode;
  const type = upper(icaoCode ?? valueAt(root, ["aircraft", "icaocode"], ["aircraft", "type"]) ?? fallback.aircraftType);
  const equipment = upper(valueAt(root, ["aircraft", "equip"], ["aircraft", "equipment"]));
  const transponder = upper(valueAt(root, ["aircraft", "transponder"]));
  return type ? `${type}${equipment ? `/${equipment}${transponder ? `/${transponder}` : ""}` : ""}` : null;
}

export function vatsimPrefileUnlocked(dataOrigin: string | null | undefined, dispatchStatus: string | null | undefined, releaseStatus?: string | null) {
  return dataOrigin === "HISPAFLY_NATIVE" ? dispatchStatus === "RELEASED" || releaseStatus === "SIGNED" : dispatchStatus === "DISPATCHED";
}

/** Builds VATSIM's documented backwards-compatible prefile form URL. */
export function buildVatsimPrefile(snapshot: unknown, fallback: VatsimPrefileFallbacks): VatsimPrefileResult {
  const root = record(snapshot);
  const callsign = upper(valueAt(root, ["general", "callsign"], ["params", "callsign"]) ?? fallback.callsign);
  const aircraft = aircraftField(root, fallback);
  const departure = upper(valueAt(root, ["origin", "icao_code"], ["params", "orig"]) ?? fallback.departureIcao);
  const arrival = upper(valueAt(root, ["destination", "icao_code"], ["params", "dest"]) ?? fallback.arrivalIcao);
  const alternate = alternateIcao(root);
  const route = upper(valueAt(root, ["general", "route_ifps"], ["general", "route"], ["params", "route"]) ?? fallback.route);
  const speed = valueAt(root, ["general", "cruise_tas"], ["general", "avg_tas"], ["params", "cruise_speed"]);
  const altitude = valueAt(root, ["general", "initial_altitude"], ["params", "fl"], ["params", "altitude"]) ?? (fallback.altitude ? String(fallback.altitude < 1000 ? fallback.altitude * 100 : fallback.altitude) : null);
  const departureTime = valueAt(root, ["times", "sched_out_hhmm"], ["params", "deptime"]) ?? hhmmFromDate(fallback.departureAt);
  const enroute = durationAt(root,
    ["times", "est_time_enroute"], ["times", "sched_time_enroute"], ["times", "air_time"],
    ["times", "enroute"], ["times", "enroute_time"], ["times", "estimated_enroute"],
    ["general", "est_time_enroute"], ["general", "air_time"], ["general", "enroute_time"],
    ["flightplan", "times", "est_time_enroute"], ["data", "times", "est_time_enroute"])
    ?? fallbackEnroute(fallback);
  const endurance = fuelEndurance(root);
  const registration = upper(valueAt(root, ["aircraft", "reg"], ["params", "reg"]) ?? fallback.aircraftRegistration);
  const remarksBase = valueAt(root, ["general", "dx_rmk"], ["general", "sys_rmk"], ["params", "remarks"]) ?? "";
  const remarks = [remarksBase, registration && !remarksBase.toUpperCase().includes("REG/") ? `REG/${registration.replace(/[^A-Z0-9]/g, "")}` : null, "OPR/HISPAFLY"].filter(Boolean).join(" ").trim();

  const required: Array<[string, string | null | undefined]> = [
    ["callsign", callsign], ["aircraft type and equipment", aircraft?.includes("/") ? aircraft : null], ["departure airport", departure], ["arrival airport", arrival],
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

  const icaoText = formatVatsimIcaoPlan(fields);
  if (missing.length) return { url: null, missing, fields, icaoText };
  const query = new URLSearchParams({ raw: "?1=I", ...fields });
  return { url: `https://my.vatsim.net/pilots/flightplan?${query}`, missing, fields, icaoText };
}

export function formatVatsimIcaoPlan(fields: Record<string, string>) {
  const time = `${fields["10a"] ?? ""}${fields["10b"] ?? ""}`;
  const endurance = `${fields["12a"] ?? ""}${fields["12b"] ?? ""}`;
  return [
    `(FPL-${fields["2"] ?? "CALLSIGN"}-${fields["1"] ?? "I"}`,
    `-${fields["3"] ?? "AIRCRAFT"}`,
    `-${fields["5"] ?? "DEP"}${fields["6"] ?? "TIME"}`,
    `-N${fields["4"] ?? "SPEED"}F${fields["7"] ?? "LEVEL"} ${fields["8"] ?? "ROUTE"}`,
    `-${fields["9"] ?? "DEST"}${time || "EET"} ${fields["13"] ?? ""}`.trimEnd(),
    `-E/${endurance || "ENDURANCE"} ${fields["11"] ?? ""})`.trimEnd(),
  ].join("\n");
}
