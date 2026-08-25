export type AmnOperationalAirportMetadata = {
  iata: string;
  icao: string;
  name?: string | null;
  city?: string | null;
  country?: string | null;
  countryIso2?: string | null;
  timezone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function toAmnAirportMetadata(airport: {
  iata: string | null;
  icao: string;
  name: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
}): AmnOperationalAirportMetadata {
  if (!airport.iata) throw new Error("AIRPORT_IATA_REQUIRED");
  const country = airport.country?.trim() || null;
  const region = airport.region?.trim().toUpperCase() || "";
  const regionIso2 = region.match(/^([A-Z]{2})(?:[-_]|$)/)?.[1] ?? null;
  const countryIso2 = regionIso2 ?? (country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null);
  return {
    iata: airport.iata.trim().toUpperCase(),
    icao: airport.icao.trim().toUpperCase(),
    name: airport.name,
    city: airport.city,
    country,
    countryIso2,
    timezone: airport.timezone,
    latitude: airport.latitude,
    longitude: airport.longitude,
  };
}
