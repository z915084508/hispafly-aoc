import assert from "node:assert/strict";
import { signAmnPayloadAllocation, verifyAmnPayloadAllocation, type AmnPayloadAllocation } from "./payload.ts";

process.env.AUTH_SECRET = "amn-payload-test-signing-secret-1234567890";
const allocation: AmnPayloadAllocation = {
  payloadRequestId: "payload_test",
  externalFlightId: "HF101",
  operatingDate: "2026-08-25",
  routeId: "route_test",
  aircraftId: "aircraft_test",
  aircraftTypeCode: "E195",
  registration: "EC-EHA",
  marketSnapshotId: "market_test",
  loadStage: "FINAL",
  passengers: 92,
  cargoWeightKg: 1200,
  cargoVolumeM3: 8.4,
  sellableSeats: 118,
  maximumCargoWeightKg: 3700,
  maximumTrafficPayloadKg: 13917,
  estimatedTrafficPayloadKg: 10400,
  provenance: { assemblyModelId: "AMN_PAYLOAD_ASSEMBLY_V1" },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const token = signAmnPayloadAllocation(allocation);
assert.deepEqual(verifyAmnPayloadAllocation(token), allocation);
assert.throws(() => verifyAmnPayloadAllocation(`${token.slice(0, -1)}x`), /invalid/);
assert.throws(() => verifyAmnPayloadAllocation(signAmnPayloadAllocation({ ...allocation, expiresAt: "2020-01-01T00:00:00.000Z" })), /expired/);
console.log("AMN Payload allocation: signed binding, tamper rejection and expiry passed.");
