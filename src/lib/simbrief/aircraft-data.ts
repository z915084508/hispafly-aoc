// acdata weight units: https://developers.navigraph.com/docs/simbrief/using-the-api
export interface AmnAircraftPerformance {
  operatingEmptyWeightKg: number | null;
  maxZeroFuelWeightKg: number | null;
  maxTakeoffWeightKg: number | null;
  maxLandingWeightKg: number | null;
  maxFuelKg?: number | null;
}
export interface SimBriefAircraftData {
  oew: number; mzfw: number; mtow: number; mlw: number;
  maxfuel?: number; maxpax?: number;
}
const KG_PER_KLB = 453.59237;
export function kgToThousandPounds(kg: number) {
  if (!Number.isFinite(kg) || kg <= 0) throw new Error("AMN aircraft weights must be finite positive kg values.");
  return Math.round(kg / KG_PER_KLB * 1000) / 1000;
}
export function mapAmnAircraftData(profile: AmnAircraftPerformance | null | undefined, seatCapacity?: number | null): SimBriefAircraftData {
  if (!profile) throw new Error("AMN AircraftPerformanceProfile is missing. Configure the aircraft before generating SimBrief OFP.");
  const required = { oew: profile.operatingEmptyWeightKg, mzfw: profile.maxZeroFuelWeightKg, mtow: profile.maxTakeoffWeightKg, mlw: profile.maxLandingWeightKg };
  for (const [key, value] of Object.entries(required)) {
    if (value == null || !Number.isFinite(value) || value <= 0) throw new Error(`AMN aircraft ${key.toUpperCase()} is missing or invalid. Configure the aircraft before generating SimBrief OFP.`);
  }
  const { oew, mzfw, mtow, mlw } = required as Record<keyof typeof required, number>;
  if (oew >= mzfw || mzfw > mtow || mlw < oew || mlw > mtow) throw new Error("AMN aircraft weight limits are inconsistent (OEW, MZFW, MTOW, MLW).");
  const data: SimBriefAircraftData = { oew: kgToThousandPounds(oew), mzfw: kgToThousandPounds(mzfw), mtow: kgToThousandPounds(mtow), mlw: kgToThousandPounds(mlw) };
  if (profile.maxFuelKg != null) data.maxfuel = kgToThousandPounds(profile.maxFuelKg);
  if (seatCapacity != null) {
    if (!Number.isInteger(seatCapacity) || seatCapacity < 0) throw new Error("AMN aircraft seat capacity is invalid.");
    data.maxpax = seatCapacity;
  }
  return data;
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function assertOfpAircraftWeights(snapshot: unknown, expected: SimBriefAircraftData) {
  const root = record(snapshot), params = record(root.params), weights = record(root.weights);
  const units = String(params.units ?? "").toUpperCase();
  if (!["KGS", "LBS"].includes(units)) throw new Error("SimBrief OFP weight units are missing or unsupported; regenerate the OFP.");
  const kgPerUnit = units === "LBS" ? 0.45359237 : 1;
  // Allow 0.001 klb input precision plus whole kg/lb output rounding.
  const toleranceKg = 2;
  const checks = [["OEW", weights.oew, expected.oew], ["MZFW", weights.max_zfw, expected.mzfw],
    // max_tow can be performance limited; use the structural limit when available.
    ["MTOW", weights.max_tow_struct ?? weights.max_tow, expected.mtow], ["MLW", weights.max_ldw_struct ?? weights.max_ldw, expected.mlw]] as const;
  for (const [label, raw, klb] of checks) {
    const value = typeof raw === "number" || (typeof raw === "string" && raw.trim()) ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value <= 0) throw new Error(`SimBrief OFP ${label} is missing or invalid; regenerate using AMN aircraft data.`);
    if (Math.abs(value * kgPerUnit - klb * KG_PER_KLB) > toleranceKg) throw new Error(`SimBrief OFP ${label} does not match AMN aircraft data; regenerate the OFP before signing.`);
  }
}
