export type SimBriefPrimitive = string | number | boolean | null;
export type SimBriefQueryValue = SimBriefPrimitive | readonly SimBriefPrimitive[] | undefined;
export type SimBriefQuery = Record<string, SimBriefQueryValue>;
export type SimBriefPayload = Record<string, unknown>;

export interface SimBriefFlightplan {
  request_id?: string | number;
  static_id?: string;
  [key: string]: unknown;
}

export interface SimBriefFlightplanList {
  flightplans?: SimBriefFlightplan[];
  [key: string]: unknown;
}

export function buildSimBriefPayload<T extends SimBriefPayload>(payload: T): T {
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.filter((item) => item !== undefined).map(clean);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, clean(item)]));
    }
    return value;
  };
  return clean(payload) as T;
}

export function buildSimBriefFormBody(payload: SimBriefPayload) {
  const params = new URLSearchParams();
  const clean = buildSimBriefPayload(payload);
  for (const [key, value] of Object.entries(clean)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) params.set(key, value.filter((item) => item !== undefined && item !== null && item !== "").join(","));
    else if (value instanceof Date) params.set(key, value.toISOString());
    else if (typeof value === "object") params.set(key, JSON.stringify(value));
    else params.set(key, String(value));
  }
  return params;
}
