import assert from "node:assert/strict";
import { requestAmnPayload, signAmnPayloadAllocation, verifyAmnPayloadAllocation, type AmnPayloadAllocation } from "./payload.ts";

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
const [encoded, signature] = token.split(".");
assert.throws(() => verifyAmnPayloadAllocation(`${encoded}.${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`), /invalid/);
assert.throws(() => verifyAmnPayloadAllocation(signAmnPayloadAllocation({ ...allocation, expiresAt: "2020-01-01T00:00:00.000Z" })), /expired/);
console.log("AMN Payload allocation: signed binding, tamper rejection and expiry passed.");

process.env.AMN_API_BASE_URL = "https://amn.test";
process.env.AMN_API_KEY = "test-only-credential";
const originalFetch = globalThis.fetch;
const input = { ...allocation, flightNumber: "HF101", originIata: "MAD", destinationIata: "PMI", idempotencyKey: "aoc-test-identity" };
const response = { ...allocation, allocationStatus: "HELD", holdExpiresAt: allocation.expiresAt, capacity: { sellableSeats: 118, maximumCargoWeightKg: 3700, maximumTrafficPayloadKg: 13917 }, passengers: { count: 92 }, cargo: { weightKg: 1200, volumeM3: 8.4 } };
try {
  globalThis.fetch = async () => new Response(JSON.stringify({ ...response, externalFlightId: "other-flight" }));
  await assert.rejects(() => requestAmnPayload(input), /PAYLOAD_IDENTITY_MISMATCH/);
  globalThis.fetch = async () => new Response(JSON.stringify({ ...response, operatingDate: "2026-08-26" }));
  await assert.rejects(() => requestAmnPayload(input), /PAYLOAD_IDENTITY_MISMATCH/);
  globalThis.fetch = async () => new Response(JSON.stringify(response));
  const result = await requestAmnPayload(input);
  assert.equal(result.provenance.operatingDate, input.operatingDate);
  assert.equal(result.provenance.externalFlightId, input.externalFlightId);
} finally { globalThis.fetch = originalFetch; }
console.log("AMN response identity and persisted operating-day binding passed.");
