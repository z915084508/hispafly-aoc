import { createHmac, timingSafeEqual } from "node:crypto";
import type { AmnOperationalAirportMetadata } from "./airport-metadata";
export type { AmnOperationalAirportMetadata } from "./airport-metadata";

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

async function amnPost<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
  const { baseUrl, apiKey } = configuration();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey.slice(0, 128),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as T & { error?: { code?: string; message?: string } } | null;
  if (!response.ok || !payload) {
    throw new Error(`AMN ${payload?.error?.code ?? `HTTP_${response.status}`}: ${payload?.error?.message ?? "Request failed."}`);
  }
  if (payload.error) throw new Error(`AMN ${payload.error.code ?? `HTTP_${response.status}`}: ${payload.error.message ?? "Request failed."}`);
  return payload;
}

function signingSecret() {
  const secret =
    process.env.AMN_ALLOCATION_SIGNING_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.AOC_PILOT_SESSION_SECRET?.trim() ||
    process.env.AMN_API_KEY?.trim();
  if (!secret || secret.length < 24) throw new Error("AOC allocation signing is not configured.");
  return secret;
}

export async function requestAmnPayload(input: {
  externalFlightId: string; flightNumber: string; operatingDate: string;
  originIata: string; destinationIata: string; aircraftTypeCode: string;
  registration: string; routeId: string; aircraftId: string; idempotencyKey: string;
  sourceRouteId?: string | null; scheduledDepartureUtc?: string | null;
  capacitySnapshot?: {
    sellableSeats: number;
    maximumCargoWeightKg: number;
    maximumTrafficPayloadKg: number;
    maximumCargoVolumeM3?: number | null;
    source?: string | null;
  } | null;
  loadStage?: AmnPayloadStage;
}): Promise<AmnPayloadAllocation> {
  const body = await amnPost<AmnResponse>("/api/v1/live-payload-requests", {
    externalFlightId: input.externalFlightId,
    flightNumber: input.flightNumber,
    operatingDate: input.operatingDate,
    originIata: input.originIata,
    destinationIata: input.destinationIata,
    aircraftTypeCode: input.aircraftTypeCode,
    registration: input.registration,
    sourceRouteId: input.sourceRouteId ?? input.routeId,
    scheduledDepartureUtc: input.scheduledDepartureUtc ?? null,
    capacitySnapshot: input.capacitySnapshot ?? null,
    loadStage: input.loadStage ?? "FINAL",
  }, input.idempotencyKey);
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
  const body = await amnPost<{ allocationStatus?: string }>("/api/v1/payload-confirmations", input, `confirm:${input.payloadRequestId}:${input.externalBookingId}`);
  if (body.allocationStatus !== "CONFIRMED") throw new Error("AMN Payload confirmation failed.");
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
