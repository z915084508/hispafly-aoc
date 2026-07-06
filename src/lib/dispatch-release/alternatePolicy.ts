const ISLAND_DESTINATION_ALTERNATES: Record<string, string[]> = {
  LEPA: ["LEIB", "LEVC", "LEBL", "LEAL"],
  LEIB: ["LEPA", "LEVC", "LEAL", "LEBL"],
  LEMH: ["LEPA", "LEIB", "LEBL", "LEVC"],
  GCFV: ["GCLP", "GCRR", "GCTS"],
  GCRR: ["GCFV", "GCLP", "GCTS"],
  GCLP: ["GCFV", "GCRR", "GCTS"],
  GCTS: ["GCLP", "GCFV", "GCRR"],
  GCXO: ["GCTS", "GCLP", "GCFV"],
  GCLA: ["GCTS", "GCLP", "GCFV"],
  GCHI: ["GCTS", "GCLP", "GCFV"],
  GCGM: ["GCTS", "GCLP", "GCFV"],
};

function normalizeIcao(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export function isDestinationAlternateRequired(input: { departureIcao?: string | null; arrivalIcao?: string | null }) {
  const departure = normalizeIcao(input.departureIcao);
  const arrival = normalizeIcao(input.arrivalIcao);
  return Boolean(arrival && departure !== arrival && ISLAND_DESTINATION_ALTERNATES[arrival]);
}

export function recommendedDestinationAlternates(arrivalIcao: string | null | undefined) {
  return ISLAND_DESTINATION_ALTERNATES[normalizeIcao(arrivalIcao)] ?? [];
}

export function normalizeAlternateIcao(value: string | null | undefined) {
  const normalized = normalizeIcao(value);
  if (!normalized) return null;
  if (!/^[A-Z]{4}$/.test(normalized)) throw new Error("Alternate ICAO must be a valid 4-letter airport code.");
  return normalized;
}
