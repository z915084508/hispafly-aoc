export type CutoverClassification = "NATIVE_READY" | "LEGACY_LINKED" | "LEGACY_UNRESOLVED" | "LEGACY_HISTORICAL_ONLY" | "INVALID_REQUIRES_REVIEW";

export function classifyRecord(input: {
  origin: string;
  internalIdentityComplete: boolean;
  historicalOnly?: boolean;
  invalid?: boolean;
  uniquelyLinked?: boolean;
}): CutoverClassification {
  if (input.invalid) return "INVALID_REQUIRES_REVIEW";
  if (input.origin === "HISPAFLY_NATIVE" && input.internalIdentityComplete) return "NATIVE_READY";
  if (input.historicalOnly) return "LEGACY_HISTORICAL_ONLY";
  if (input.uniquelyLinked && input.internalIdentityComplete) return "LEGACY_LINKED";
  return "LEGACY_UNRESOLVED";
}

export function uniqueExactCandidate<T>(candidates: T[]) {
  return candidates.length === 1 ? candidates[0] : null;
}
