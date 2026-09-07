export function normalizeAmnRegistration(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

export function resolveAmnAircraftTypeCode(input: {
  assignedAircraft?: { aircraftType: string | null } | null;
  fleet?: { type: string | null; iataType: string | null; code: string | null } | null;
}) {
  const candidates = [input.assignedAircraft?.aircraftType, input.fleet?.type, input.fleet?.iataType, input.fleet?.code];
  for (const candidate of candidates) {
    const raw = candidate?.trim().toUpperCase() ?? "";
    const compact = raw.replace(/[^A-Z0-9]/g, "");
    if (["PAX", "PASSENGER", "FLEET"].includes(compact)) continue;
    const direct = compact.match(/^(A3\d{2}|A2\d{2}|B7\d{2}|B3\d{2}|E\d{3}|CRJ\d|AT\d{2})/)?.[1];
    if (direct && /^[A-Z0-9]{2,4}$/.test(direct)) return direct;
    if (/^[A-Z0-9]{2,4}$/.test(compact)) return compact;
  }
  return null;
}
