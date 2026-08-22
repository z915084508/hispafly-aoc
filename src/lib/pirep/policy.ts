import type { PirepRejectCode, PirepStatus } from "@prisma/client";

export const PIREP_REJECT_REASONS: Record<PirepRejectCode, string> = {
  R01: "Incomplete Flight",
  R02: "Invalid Flight Data",
  R03: "Duplicate PIREP",
  R04: "Invalid Operation",
  R05: "Abnormal Flight Termination",
  R06: "Unauthorized Aircraft Type",
  R07: "Data Integrity / Manipulation",
  R08: "Serious Operational Rule Violation",
};

export const AUTO_REJECT_CODES = new Set<PirepRejectCode>(["R03", "R06"]);
export const PIREP_STATUSES: PirepStatus[] = ["submitted", "validation", "manual_review", "accepted", "rejected"];

export type NativeValidationInput = {
  positionCount: number;
  finalOnGround: boolean;
  currentPhase?: string | null;
  reportedAircraftType?: string | null;
  authorizedAircraftType?: string | null;
  duplicate: boolean;
  flightTimeMinutes?: number | null;
  blockTimeMinutes?: number | null;
};

export function normalizeAircraftType(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
}

export function validateNativePirep(input: NativeValidationInput): { status: PirepStatus; rejectCode: PirepRejectCode | null; comment: string | null } {
  if (input.duplicate) return { status: "rejected", rejectCode: "R03", comment: "An earlier PIREP already exists for this dispatch/session identity." };
  const reported = normalizeAircraftType(input.reportedAircraftType);
  const authorized = normalizeAircraftType(input.authorizedAircraftType);
  if (reported && authorized && reported !== authorized) {
    return { status: "rejected", rejectCode: "R06", comment: `Reported ICAO aircraft type ${reported} does not match authorized type ${authorized}.` };
  }
  if (input.positionCount < 2 || !input.finalOnGround) {
    return { status: "manual_review", rejectCode: "R01", comment: "The recorded flight is incomplete or does not finish on the ground." };
  }
  if ((input.flightTimeMinutes ?? 0) < 1 || (input.blockTimeMinutes ?? 0) < (input.flightTimeMinutes ?? 0)) {
    return { status: "manual_review", rejectCode: "R02", comment: "Core ACARS duration data is missing or internally inconsistent." };
  }
  const phase = input.currentPhase?.trim().toLowerCase();
  if (phase && !["arrived", "shutdown", "postflight", "post-flight", "on block", "on-block", "taxi in", "taxi-in"].includes(phase)) {
    return { status: "manual_review", rejectCode: "R05", comment: `The ACARS session ended during phase ${input.currentPhase}.` };
  }
  return { status: "accepted", rejectCode: null, comment: null };
}
