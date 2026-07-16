import { prisma } from "@/lib/prisma";
import { normalizeIata, normalizeIcao } from "./normalize";

export type NativeOrigin = "HISPAFLY_NATIVE" | "IMPORTED" | "MANUAL";
export const findAirportById = (id: string) => prisma.airport.findUnique({ where: { id } });
export const findAirportByIcao = (icao: string) => prisma.airport.findUnique({ where: { icao: normalizeIcao(icao) } });

export function createNativeAirport(input: {
  icao: string; iata?: string | null; name?: string | null; city?: string | null;
  country?: string | null; timezone?: string | null; latitude?: number | null;
  longitude?: number | null; dataOrigin?: NativeOrigin;
}) {
  return prisma.airport.create({ data: {
    icao: normalizeIcao(input.icao), iata: normalizeIata(input.iata),
    name: input.name?.trim() || null, city: input.city?.trim() || null,
    country: input.country?.trim() || null, timezone: input.timezone?.trim() || null,
    latitude: input.latitude ?? null, longitude: input.longitude ?? null,
    dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE", source: "hispafly_native",
  } });
}
