/** Use the original allocation day, which may differ from the UTC departure day. */
export function amnConfirmationIdentity(provenance: Record<string, unknown> | null, legacyFlightId: string | null, legacyDeparture: Date) {
  const externalFlightId = typeof provenance?.externalFlightId === "string" ? provenance.externalFlightId : legacyFlightId;
  const operatingDate = typeof provenance?.operatingDate === "string" ? provenance.operatingDate : legacyDeparture.toISOString().slice(0, 10);
  if (!externalFlightId || !/^\d{4}-\d{2}-\d{2}$/.test(operatingDate) || !Number.isFinite(Date.parse(`${operatingDate}T00:00:00Z`)) || new Date(`${operatingDate}T00:00:00Z`).toISOString().slice(0, 10) !== operatingDate) throw new Error("AMN confirmation requires the original allocation identity.");
  return { externalFlightId, operatingDate };
}
