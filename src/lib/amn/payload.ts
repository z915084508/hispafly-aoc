import { createHmac, timingSafeEqual } from "node:crypto";

export type AmnPayloadStage = "FORECAST" | "BOOKED" | "FINAL";

export type AmnPayloadAllocation = {
  payloadRequestId: string;
  externalFlightId: string;
  operatingDate: string;
  routeId: string;
  aircraftId: string;
  aircraftTypeCode: string;
  registration: string;
  marketSnapshotId: string;
  loadStage: AmnPayloadStage;
  passengers: number;
  cargoWeightKg: number;
  cargoVolumeM3: number;
  sellableSeats: number;
  maximumCargoWeightKg: number;
  maximumTrafficPayloadKg: number;
  estimatedTrafficPayloadKg: number;
  provenance: Record<string, unknown>;
  expiresAt: string;
};

type AmnResponse = {
  payloadRequestId: string;
  externalFlightId: string;
  operatingDate: string;
  loadStage: AmnPayloadStage;
  marketSnapshotId: string;
  capacity: { sellableSeats: number; maximumCargoWeightKg: number; maximumTrafficPayloadKg: number };
  passengers: { count: number };
  cargo: { weightKg: number; volumeM3: number };
  estimatedTrafficPayloadKg: number;
  provenance: Record<string, unknown>;
  allocationStatus: "HELD";
  holdExpiresAt: string;
};

const integer = (value: unknown, name: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`AMN returned invalid ${name}.`);
  return Number(value);
};

function configuration() {
  const baseUrl = process.env.AMN_API_BASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AMN_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("AMN Payload access is not configured.");
  return { baseUrl, apiKey };
}

function signingSecret() {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.AOC_PILOT_SESSION_SECRET?.trim();
  if (!secret || secret.length < 24) throw new Error("AOC allocation signing is not configured.");
  return secret;
}

export async function requestAmnPayload(input: {
  externalFlightId: string; flightNumber: string; operatingDate: string;
  originIata: string; destinationIata: string; aircraftTypeCode: string;
  registration: string; routeId: string; aircraftId: string; idempotencyKey: string;
  loadStage?: AmnPayloadStage;
}): Promise<AmnPayloadAllocation> {
  const { baseUrl, apiKey } = configuration();
  const response = await fetch(`${baseUrl}/api/v1/payload-requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      externalFlightId: input.externalFlightId,
      flightNumber: input.flightNumber,
      operatingDate: input.operatingDate,
      originIata: input.originIata,
      destinationIata: input.destinationIata,
      aircraftTypeCode: input.aircraftTypeCode,
      registration: input.registration,
      loadStage: input.loadStage ?? "FINAL",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as AmnResponse | { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    const error = body && "error" in body ? body.error : null;
    throw new Error(`AMN ${error?.code ?? `HTTP_${response.status}`}: ${error?.message ?? "Payload request failed."}`);
  }
  if (!body || !("payloadRequestId" in body) || !body.capacity || !body.passengers || !body.cargo) throw new Error("AMN returned an invalid Payload response.");
  if (body.allocationStatus !== "HELD" || !body.holdExpiresAt || Date.parse(body.holdExpiresAt) <= Date.now()) throw new Error("AMN did not return an active Payload hold.");
  const passengers = integer(body.passengers.count, "passenger count");
  const cargoWeightKg = integer(body.cargo.weightKg, "cargo weight");
  const sellableSeats = integer(body.capacity.sellableSeats, "seat capacity");
  const maximumCargoWeightKg = integer(body.capacity.maximumCargoWeightKg, "cargo capacity");
  const maximumTrafficPayloadKg = integer(body.capacity.maximumTrafficPayloadKg, "traffic payload capacity");
  const estimatedTrafficPayloadKg = integer(body.estimatedTrafficPayloadKg, "traffic payload");
  if (passengers > sellableSeats || cargoWeightKg > maximumCargoWeightKg || estimatedTrafficPayloadKg > maximumTrafficPayloadKg) {
    throw new Error("AMN Payload exceeds the resolved aircraft capacity.");
  }
  return {
    payloadRequestId: body.payloadRequestId,
    externalFlightId: body.externalFlightId,
    operatingDate: body.operatingDate,
    routeId: input.routeId,
    aircraftId: input.aircraftId,
    aircraftTypeCode: input.aircraftTypeCode,
    registration: input.registration,
    marketSnapshotId: body.marketSnapshotId,
    loadStage: body.loadStage,
    passengers,
    cargoWeightKg,
    cargoVolumeM3: Number(body.cargo.volumeM3),
    sellableSeats,
    maximumCargoWeightKg,
    maximumTrafficPayloadKg,
    estimatedTrafficPayloadKg,
    provenance: body.provenance,
    expiresAt: body.holdExpiresAt,
  };
}

export async function confirmAmnPayload(input: { payloadRequestId: string; externalFlightId: string; operatingDate: string; externalBookingId: string; externalDispatchId: string; externalOfpId: string }): Promise<void> {
  const { baseUrl, apiKey } = configuration();
  const idempotencyKey = `confirm:${input.payloadRequestId}:${input.externalBookingId}`.slice(0, 128);
  const response = await fetch(`${baseUrl}/api/v1/payload-confirmations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as { allocationStatus?: string; error?: { code?: string; message?: string } } | null;
  if (!response.ok || body?.allocationStatus !== "CONFIRMED") throw new Error(`AMN ${body?.error?.code ?? `HTTP_${response.status}`}: ${body?.error?.message ?? "Payload confirmation failed."}`);
}

export async function declareAmnScheduledFlight(input: {
  externalFlightId: string; flightNumber: string; operatingDate: string;
  originIata: string; destinationIata: string; scheduledDepartureUtc: string;
  aircraftTypeCode: string; registration: string; idempotencyKey: string;
}): Promise<{ scheduleRecordId: string; status: string }> {
  const { baseUrl, apiKey } = configuration();
  const response = await fetch(`${baseUrl}/api/v1/scheduled-flights`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as { scheduleRecordId?: string; status?: string; error?: { code?: string; message?: string } } | null;
  if (!response.ok || !body?.scheduleRecordId) throw new Error(`AMN ${body?.error?.code ?? `HTTP_${response.status}`}: ${body?.error?.message ?? "Scheduled flight declaration failed."}`);
  return { scheduleRecordId: body.scheduleRecordId, status: body.status ?? "DECLARED" };
}

export function signAmnPayloadAllocation(allocation: AmnPayloadAllocation): string {
  const payload = Buffer.from(JSON.stringify(allocation)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAmnPayloadAllocation(token: string): AmnPayloadAllocation {
  const [payload, presented, extra] = token.split(".");
  if (!payload || !presented || extra) throw new Error("AMN Payload allocation token is invalid.");
  const expected = createHmac("sha256", signingSecret()).update(payload).digest();
  const signature = Buffer.from(presented, "base64url");
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error("AMN Payload allocation token is invalid.");
  const allocation = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AmnPayloadAllocation;
  if (!allocation.payloadRequestId || Date.parse(allocation.expiresAt) <= Date.now()) throw new Error("AMN Payload allocation has expired. Generate it again.");
  return allocation;
}
