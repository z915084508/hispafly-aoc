import { Prisma } from "@prisma/client";
import type { RouteFormInput, VamsysRouteData, VamsysRoutePayload } from "./types";

const duration = (minutes?: number | null) => minutes ? `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00` : undefined;
const minutes = (value?: string | null) => { if (!value) return null; const [h, m, s = 0] = value.split(":").map(Number); return Number.isFinite(h + m + s) ? Math.round(h * 60 + m + s / 60) : null; };
const date = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;

export function externalRouteToPrisma(route: VamsysRouteData, airports: Map<string, string>) {
  return { vamsysRouteId: String(route.id), flightNumber: route.flight_number, callsign: route.callsign, departure: airports.get(String(route.departure_id)) ?? "ZZZZ", arrival: airports.get(String(route.arrival_id)) ?? "ZZZZ", route: route.route ?? null, scheduledDurationMinutes: minutes(route.flight_length), distanceNm: route.flight_distance ?? null, cruiseAltitude: route.altitude ?? null, costIndex: route.cost_index && /^\d+$/.test(route.cost_index) ? Number(route.cost_index) : null, operationalStatus: route.hidden ? "HIDDEN" as const : "ACTIVE" as const, syncStatus: "SYNCED" as const, active: !route.hidden, sourceUpdatedAt: date(route.updated_at), lastSeenAt: new Date(), lastSyncedAt: new Date(), lastSyncError: null, rawData: route as unknown as Prisma.InputJsonValue };
}

export function formToVamsysPayload(input: RouteFormInput, departureId: number, arrivalId: number, fleetIds: number[], includeAirports: boolean): VamsysRoutePayload {
  return { type: input.type, callsign: input.callsign, flight_number: input.flightNumber, ...(includeAirports ? { departure_id: departureId, arrival_id: arrivalId } : {}), departure_time: input.departureTime, arrival_time: input.arrivalTime, flight_length: duration(input.durationMinutes), flight_distance: input.distanceNm, altitude: input.altitude, cost_index: input.costIndex, route: input.route, hidden: input.hidden, remarks: input.remarks, fleet_ids: fleetIds };
}
