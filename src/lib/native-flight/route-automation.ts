export type RouteMarketType = "DOMESTIC" | "SCHENGEN" | "NON_SCHENGEN";

export const ROUTE_MARKET_RANGES: Record<RouteMarketType, { start: number; end: number; label: string }> = {
  DOMESTIC: { start: 1000, end: 2999, label: "Domestic" },
  SCHENGEN: { start: 3000, end: 5999, label: "Schengen international" },
  NON_SCHENGEN: { start: 6000, end: 8999, label: "Non-Schengen international" },
};

// Bulgaria and Romania are included as full Schengen members. Cyprus and Ireland
// are intentionally excluded because passenger border controls still apply.
export const SCHENGEN_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
  "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK",
]);

const COUNTRY_ALIASES: Record<string, string> = {
  spain: "ES", espana: "ES",
  portugal: "PT",
  france: "FR", francia: "FR",
  germany: "DE", deutschland: "DE", alemania: "DE",
  italy: "IT", italia: "IT",
  netherlands: "NL", holland: "NL", holanda: "NL", paisesbajos: "NL",
  belgium: "BE", belgique: "BE", belgica: "BE",
  luxembourg: "LU", luxemburgo: "LU",
  austria: "AT",
  switzerland: "CH", suisse: "CH", schweiz: "CH", suiza: "CH",
  liechtenstein: "LI",
  norway: "NO", norge: "NO", noruega: "NO",
  iceland: "IS", islandia: "IS",
  denmark: "DK", dinamarca: "DK",
  sweden: "SE", suecia: "SE",
  finland: "FI", finlandia: "FI",
  estonia: "EE",
  latvia: "LV", letonia: "LV",
  lithuania: "LT", lituania: "LT",
  poland: "PL", polonia: "PL",
  czechia: "CZ", czechrepublic: "CZ", republicacheca: "CZ",
  slovakia: "SK", eslovaquia: "SK",
  slovenia: "SI", eslovenia: "SI",
  hungary: "HU", hungria: "HU",
  greece: "GR", grecia: "GR", hellas: "GR",
  malta: "MT",
  croatia: "HR", croacia: "HR",
  bulgaria: "BG",
  romania: "RO", rumania: "RO",
  unitedkingdom: "GB", greatbritain: "GB", britain: "GB", reinounido: "GB", england: "GB", scotland: "GB", wales: "GB",
  ireland: "IE", irlanda: "IE",
  cyprus: "CY", chipre: "CY",
  turkey: "TR", turkiye: "TR", turquia: "TR",
  morocco: "MA", marruecos: "MA",
  algeria: "DZ", argelia: "DZ",
  tunisia: "TN", tunez: "TN",
  serbia: "RS",
  albania: "AL",
  bosniaandherzegovina: "BA", bosnia: "BA",
  montenegro: "ME",
  northmacedonia: "MK", macedoniadelnorte: "MK",
  kosovo: "XK",
  unitedstates: "US", unitedstatesofamerica: "US", usa: "US", estadosunidos: "US",
  canada: "CA",
  mexico: "MX",
  unitedarabemirates: "AE", emiratosarabesunidos: "AE",
  qatar: "QA",
};

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeCountryCode(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper === "UK" ? "GB" : upper;
  return COUNTRY_ALIASES[normalizeText(trimmed)] ?? null;
}

export function classifyRouteMarket(
  departure: { country?: string | null },
  arrival: { country?: string | null },
): RouteMarketType {
  const departureCountry = normalizeCountryCode(departure.country);
  const arrivalCountry = normalizeCountryCode(arrival.country);
  if (!departureCountry || !arrivalCountry) {
    throw new Error("Both airports need a recognizable country before an automatic flight number can be assigned.");
  }
  if (departureCountry === arrivalCountry) return "DOMESTIC";
  if (SCHENGEN_COUNTRY_CODES.has(departureCountry) && SCHENGEN_COUNTRY_CODES.has(arrivalCountry)) return "SCHENGEN";
  return "NON_SCHENGEN";
}

export function routeMarketLabel(marketType: RouteMarketType) {
  return ROUTE_MARKET_RANGES[marketType].label;
}

export function buildRouteCode(airport: { iata?: string | null; icao: string }) {
  return (airport.iata?.trim() || airport.icao).toUpperCase();
}

export function buildRoutePairCode(
  departure: { iata?: string | null; icao: string },
  arrival: { iata?: string | null; icao: string },
) {
  return `${buildRouteCode(departure)}-${buildRouteCode(arrival)}`;
}

function occupiedNumbers(items: Array<{ flightNumber?: string | null; callsign?: string | null }>) {
  const occupied = new Set<number>();
  for (const item of items) {
    for (const value of [item.flightNumber, item.callsign]) {
      const match = value?.trim().toUpperCase().match(/^(?:HF|HPF)(\d{4})$/);
      if (match) occupied.add(Number(match[1]));
    }
  }
  return occupied;
}

function identity(number: number) {
  return { number, flightNumber: `HF${number}`, callsign: `HPF${number}` };
}

export function nextRouteIdentities(
  marketType: RouteMarketType,
  items: Array<{ flightNumber?: string | null; callsign?: string | null }>,
  createReturnRoute = false,
) {
  const { start, end } = ROUTE_MARKET_RANGES[marketType];
  const occupied = occupiedNumbers(items);

  if (createReturnRoute) {
    let number = start % 2 === 0 ? start : start + 1;
    for (; number + 1 <= end; number += 2) {
      if (!occupied.has(number) && !occupied.has(number + 1)) {
        return { marketType, outbound: identity(number), return: identity(number + 1) };
      }
    }
    throw new Error(`No unused consecutive HF/HPF identities remain in the ${start}-${end} range.`);
  }

  for (let number = start; number <= end; number += 1) {
    if (!occupied.has(number)) return { marketType, outbound: identity(number), return: null };
  }
  throw new Error(`No unused HF/HPF identities remain in the ${start}-${end} range.`);
}

export function greatCircleDistanceNm(
  departure: { latitude: number; longitude: number },
  arrival: { latitude: number; longitude: number },
) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(arrival.latitude - departure.latitude);
  const longitudeDelta = radians(arrival.longitude - departure.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(departure.latitude)) * Math.cos(radians(arrival.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.max(1, Math.round(3440.065 * 2 * Math.asin(Math.sqrt(a))));
}

export function estimateBlockMinutes(distanceNm: number, cruiseSpeedKts = 430) {
  const speed = Number.isFinite(cruiseSpeedKts) ? Math.min(600, Math.max(150, cruiseSpeedKts)) : 430;
  const rawMinutes = distanceNm / speed * 60 + 35;
  return Math.max(30, Math.round(rawMinutes / 5) * 5);
}
