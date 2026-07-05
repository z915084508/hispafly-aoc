export interface FlightIdentityInput {
  flightNumber?: string | null;
  callsign?: string | null;
  airlineIcao?: string;
  commercialPrefix?: string;
  airlineName?: string;
}

const compactUpper = (value: string | null | undefined) => (value ?? "").trim().toUpperCase().replace(/\s+/g, "");

export function normalizeFlightIdentity(input: FlightIdentityInput) {
  const airlineIcao = compactUpper(input.airlineIcao || "HPF");
  const commercialPrefix = compactUpper(input.commercialPrefix || "HF");
  const airlineName = (input.airlineName || "HISPAFLY").trim().toUpperCase();
  const rawFlightNumber = compactUpper(input.flightNumber);
  const rawCallsign = compactUpper(input.callsign);
  const callsignNumber = rawCallsign.match(/\d+/)?.[0] ?? "";
  const numericFlightNumber = rawFlightNumber.match(/\d+/)?.[0] ?? callsignNumber;
  const commercialFlightNumber = numericFlightNumber ? `${commercialPrefix}${numericFlightNumber}` : rawFlightNumber;
  const atcCallsign = rawCallsign
    ? rawCallsign.startsWith(airlineName) && callsignNumber ? `${airlineIcao}${callsignNumber}` : rawCallsign
    : numericFlightNumber ? `${airlineIcao}${numericFlightNumber}` : "";
  return { commercialFlightNumber, atcCallsign, numericFlightNumber, airlineName };
}
