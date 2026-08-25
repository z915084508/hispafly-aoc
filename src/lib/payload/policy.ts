export const HISPAFLY_PAYLOAD_POLICY = Object.freeze({
  policyId: "HISPAFLY_PAYLOAD_POLICY_V1",
  baggageKgPerPassenger: 23,
  owner: "HISPAFLY",
  source: "AIRLINE_POLICY",
} as const);

export function passengerBaggageWeight(passengers: number, baggageKgPerPassenger: number = HISPAFLY_PAYLOAD_POLICY.baggageKgPerPassenger) {
  if (!Number.isSafeInteger(passengers) || passengers < 0) throw new Error("Passenger count must be a non-negative integer.");
  if (!Number.isFinite(baggageKgPerPassenger) || baggageKgPerPassenger < 0) throw new Error("Baggage per passenger must be zero or greater.");
  return Math.round(passengers * baggageKgPerPassenger);
}
