export function durationMinutes(value: unknown): number | null {
  if (typeof value === "string" && /^\d{1,3}:\d{2}(?::\d{2})?$/.test(value.trim())) {
    const parts = value.trim().split(":").map(Number);
    return parts.length === 3 ? Math.round(parts[0] * 60 + parts[1] + parts[2] / 60) : Math.round(parts[0] * 60 + parts[1]);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric >= 600 ? numeric / 60 : numeric);
}

export function numericValue(value: unknown): number | null {
  const numeric = Number(typeof value === "string" ? value.replace(/,/g, "") : value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function difference(actual: number | null, planned: number | null) {
  return actual === null || planned === null ? null : actual - planned;
}

export function differencePercent(actual: number | null, planned: number | null) {
  if (actual === null || planned === null || planned <= 0) return null;
  return Math.round(((actual - planned) / planned) * 10_000) / 100;
}

export function efficiencyScore(input: { fuelDiffPercent: number | null; blockTimeDiffMinutes: number | null; landingRate: number | null }) {
  let score = 100;
  if (input.fuelDiffPercent !== null) score -= Math.max(0, input.fuelDiffPercent) * 1.5 + Math.max(0, -input.fuelDiffPercent) * 0.25;
  if (input.blockTimeDiffMinutes !== null) score -= Math.max(0, input.blockTimeDiffMinutes) * 0.4;
  if (input.landingRate !== null) score -= Math.max(0, Math.abs(input.landingRate) - 300) / 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

