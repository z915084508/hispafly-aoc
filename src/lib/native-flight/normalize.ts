export function normalizeIcao(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(normalized)) throw new Error("ICAO must contain exactly four letters or digits.");
  return normalized;
}

export function normalizeIata(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(normalized)) throw new Error("IATA must contain exactly three letters or digits.");
  return normalized;
}

export function normalizeRegistration(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{3,12}$/.test(normalized)) throw new Error("Aircraft registration is invalid.");
  return normalized;
}

export function normalizeCode(value: string, label = "Code") {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,24}$/.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}
