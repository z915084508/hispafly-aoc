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

