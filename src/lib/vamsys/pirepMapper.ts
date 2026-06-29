import { Prisma } from "@prisma/client";

function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function normalized(value: Record<string, unknown>) { const attributes = record(value.attributes); return attributes ? { ...attributes, id: value.id ?? attributes.id } : value; }
function first(source: Record<string, unknown>, keys: string[]) { for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key]; }
function text(source: Record<string, unknown>, keys: string[]): string | null { const value = first(source, keys); return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null; }
function nestedText(source: Record<string, unknown>, parent: string, keys: string[]) { const nested = record(source[parent]); return nested ? text(nested, keys) : null; }
function numberValue(source: Record<string, unknown>, keys: string[]): number | null { const value = first(source, keys); if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim()) { const parsed = Number(value.replace(",", ".")); if (Number.isFinite(parsed)) return parsed; } return null; }
function integerValue(source: Record<string, unknown>, keys: string[]) { const value = numberValue(source, keys); return value === null ? null : Math.round(value); }
function durationMinutes(source: Record<string, unknown>, keys: string[]): number | null { const value = first(source, keys); if (typeof value === "string" && /^\d{1,3}:\d{2}(?::\d{2})?$/.test(value)) { const parts = value.split(":").map(Number); return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 60 + parts[1] + Math.round(parts[2] / 60); } return integerValue(source, keys); }
function dateValue(source: Record<string, unknown>, keys: string[]): Date | null { const value = first(source, keys); if (typeof value !== "string" && typeof value !== "number") return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }

export function mapVamsysPirep(raw: Record<string, unknown>) {
  const source = normalized(raw);
  const vamsysPirepId = text(source, ["pirep_id", "pirepId", "id", "uuid"]);
  if (!vamsysPirepId) throw new Error("PIREP sin identificador vAMSYS.");
  if ((text(source, ["status"]) ?? "").toLowerCase() !== "accepted") throw new Error(`PIREP ${vamsysPirepId} no aceptado.`);
  const vamsysCreatedAt = dateValue(source, ["created_at", "createdAt"]);
  return {
    vamsysPirepId,
    flightNumber: text(source, ["flight_number", "flightNumber", "flight"]), callsign: text(source, ["callsign"]),
    departure: text(source, ["departure", "departure_icao", "origin", "origin_icao"]) ?? nestedText(source, "departure", ["icao", "ident", "id"]),
    arrival: text(source, ["arrival", "arrival_icao", "destination", "destination_icao"]) ?? nestedText(source, "arrival", ["icao", "ident", "id"]),
    aircraftType: text(source, ["aircraft_type", "aircraftType", "aircraft_icao"]) ?? nestedText(source, "aircraft", ["icao", "type", "ident"]),
    network: text(source, ["network", "online_network"]), flightTimeMinutes: durationMinutes(source, ["flight_time_minutes", "flightTimeMinutes", "flight_time", "flightTime"]),
    blockTimeMinutes: durationMinutes(source, ["block_time_minutes", "blockTimeMinutes", "block_time", "blockTime"]), landingRate: integerValue(source, ["landing_rate", "landingRate"]),
    score: integerValue(source, ["score"]), fuelUsed: integerValue(source, ["fuel_used", "fuelUsed"]), points: numberValue(source, ["points"]), credits: numberValue(source, ["credits"]),
    status: "accepted" as const, acarsSoftware: text(source, ["acars_software", "acarsSoftware", "acars"]), source: "vamsys",
    flownAt: dateValue(source, ["flown_at", "flownAt", "submitted_at", "submittedAt", "arrival_time"]) ?? vamsysCreatedAt,
    acceptedAt: dateValue(source, ["accepted_at", "acceptedAt"]), vamsysCreatedAt, vamsysUpdatedAt: dateValue(source, ["updated_at", "updatedAt"]),
    rawData: raw as Prisma.InputJsonValue, synchronizedAt: new Date(),
  };
}
