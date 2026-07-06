export type ReleaseCheckStatus = "OK" | "WARNING" | "BLOCKED" | "NOT_REQUIRED" | "PENDING";

export function aircraftConditionReleaseStatus(status: string | null, ferryAllowed: boolean): ReleaseCheckStatus {
  if (!status || status === "AOG" || status === "IN_MAINTENANCE") return "BLOCKED";
  if (status === "FERRY_ONLY") return ferryAllowed ? "OK" : "BLOCKED";
  if (["WATCH", "CAUTION", "MAINT_REQUIRED"].includes(status)) return "WARNING";
  return "OK";
}

export function overallDispatchReleaseStatus(input: { voided: boolean; blockingCount: number; signed: boolean; generated: boolean }) {
  if (input.voided) return "VOIDED";
  if (input.blockingCount > 0) return "BLOCKED";
  if (input.signed) return "SIGNED";
  return input.generated ? "READY" : "PENDING";
}

