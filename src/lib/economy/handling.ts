const AIRCRAFT_ALIASES: Record<string, string> = {
  B77W: "B772", B38M: "B738", A20N: "A320", A21N: "A321", A35K: "A359",
};

const HANDLING_CLASS_BY_AIRCRAFT: Record<string, number> = {
  AT72: 1, AT75: 1, AT76: 1, ATR72: 1, CRJ2: 1, CRJ7: 1, CRJ9: 1, CRJX: 1, DH8D: 1, E145: 1,
  B712: 2, B717: 2, BCS1: 2,
  A318: 3, A319: 3, A320: 3, B733: 3, B734: 3, B735: 3, B736: 3, B737: 3, B738: 3, B739: 3, B39M: 3, MD82: 3, MD83: 3,
  A321: 4, B752: 4,
  A300: 5, A310: 5, B753: 5, B762: 5, B763: 5, B764: 5,
  A332: 6, A333: 6, A339: 6, A359: 6, A388: 6, B772: 6, B77L: 6, B788: 6, B789: 6, B78X: 6,
};

const FULL_SERVICE_REGULAR_HANDLING_CENTS: Record<number, number> = {
  1: 61_200, 2: 96_900, 3: 131_000, 4: 150_200, 5: 175_700, 6: 175_700,
};

export function handlingFeeForAircraft(aircraftType: string | null | undefined) {
  const code = aircraftType?.trim().toUpperCase() ?? null;
  const normalizedAircraftType = code ? AIRCRAFT_ALIASES[code] ?? code : null;
  const handlingClass = normalizedAircraftType ? HANDLING_CLASS_BY_AIRCRAFT[normalizedAircraftType] ?? 3 : 3;
  return {
    amountCents: FULL_SERVICE_REGULAR_HANDLING_CENTS[handlingClass],
    handlingClass,
    normalizedAircraftType,
    class6Fallback: handlingClass === 6,
  };
}
