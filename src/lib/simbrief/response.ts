import { safeSimbriefPdfUrl } from "./pdf";

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const stringValue = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null;

function valueAt(root: JsonRecord | null, ...paths: string[][]): string | null {
  for (const path of paths) {
    let value: unknown = root;
    for (const key of path) value = record(value)?.[key];
    const result = stringValue(value);
    if (result) return result;
  }
  return null;
}

export function safeSimbriefDocumentUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), "https://www.simbrief.com");
    const host = url.hostname.toLowerCase();
    if (!/^https?:$/.test(url.protocol) || !(host === "simbrief.com" || host.endsWith(".simbrief.com"))) return null;
    return url.toString();
  } catch { return null; }
}

export function extractSimbriefOfpUrl(snapshot: unknown): string | null {
  const root = record(snapshot), files = record(root?.files), params = record(root?.params), general = record(root?.general);
  const candidates = [root?.ofpUrl, root?.ofp_url, files?.ofp, files?.html, files?.directory, params?.ofp_url, general?.ofp_url];
  for (const candidate of candidates) {
    const item = record(candidate);
    const safe = safeSimbriefDocumentUrl(item?.link ?? item?.url ?? item?.href ?? candidate);
    if (safe) return safe;
  }
  return null;
}

export function simbriefResponseUserId(snapshot: unknown): string | null {
  const root = record(snapshot);
  return valueAt(root, ["simbriefUserId"], ["user_id"], ["userid"], ["params", "user_id"], ["params", "userid"], ["general", "user_id"]);
}

export function summarizeSimbriefOfp(snapshot: unknown) {
  const root = record(snapshot);
  const alternateCandidates = [root?.alternates, root?.alternate].find(Array.isArray) as unknown[] | undefined;
  const firstAlternate = alternateCandidates?.map(record).find(Boolean) ?? null;
  return {
    requestId: valueAt(root, ["request_id"], ["params", "request_id"], ["general", "request_id"]),
    route: valueAt(root, ["general", "route"], ["general", "route_ifps"], ["params", "route"]),
    alternate: valueAt(root,
      ["alternate", "icao_code"], ["alternate", "icao"], ["alternate", "ident"],
      ["general", "alternate_icao"], ["general", "altn_icao"], ["general", "alternate"], ["params", "altn"])
      ?? valueAt(firstAlternate, ["icao_code"], ["icao"], ["ident"], ["airport", "icao_code"]),
    blockTime: valueAt(root, ["times", "est_block"], ["times", "block"], ["general", "block_time"]),
    airTime: valueAt(root, ["times", "est_time_enroute"], ["times", "air_time"], ["general", "air_time"]),
    zfw: valueAt(root, ["weights", "est_zfw"], ["weights", "zfw"], ["general", "zfw"]),
    tow: valueAt(root, ["weights", "est_tow"], ["weights", "tow"], ["general", "tow"]),
    landingWeight: valueAt(root, ["weights", "est_ldw"], ["weights", "landing_weight"], ["general", "landing_weight"]),
    blockFuel: valueAt(root, ["fuel", "plan_ramp"], ["fuel", "block"], ["fuel", "block_fuel"]),
    tripFuel: valueAt(root, ["fuel", "enroute_burn"], ["fuel", "trip"], ["fuel", "trip_fuel"]),
    reserveFuel: valueAt(root, ["fuel", "reserve"], ["fuel", "final_reserve"], ["fuel", "reserve_fuel"]),
    pdfUrl: safeSimbriefPdfUrl(record(root?.files)?.pdf ?? root?.pdfUrl ?? root?.pdf_url),
  };
}

