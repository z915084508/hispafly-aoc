import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** The accepted native PIREP is the durable queue. No legacy record can send traffic. */
export async function deliverAmnPirep(pirepId: string) {
  const pirep = await prisma.pirep.findUnique({ where: { id: pirepId }, include: { pilotBooking: true } });
  if (!pirep || pirep.dataOrigin !== "HISPAFLY_NATIVE" || pirep.status !== "accepted") return "SKIPPED";
  const booking = pirep.pilotBooking;
  if (!booking || booking.dataOrigin !== "HISPAFLY_NATIVE" || !booking.amnPayloadRequestId) return "SKIPPED";
  if (object(object(pirep.rawData).amnDelivery).status === "DELIVERED") return "DELIVERED";
  const identity = object(booking.amnPayloadProvenance);
  let outcome: Record<string, unknown>;
  try {
    const { externalFlightId, operatingDate } = identity;
    if (typeof externalFlightId !== "string" || !externalFlightId || typeof operatingDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(operatingDate)) throw new Error("ALLOCATION_IDENTITY_MISSING");
    if (!Number.isSafeInteger(pirep.passengers) || !Number.isSafeInteger(pirep.freightKg) || Number(pirep.passengers) < 0 || Number(pirep.freightKg) < 0) throw new Error("ACTUAL_LOAD_MISSING");
    const baseUrl = process.env.AMN_API_BASE_URL?.trim().replace(/\/$/, "");
    const key = process.env.AMN_API_KEY?.trim();
    if (!baseUrl || !key) throw new Error("AMN_NOT_CONFIGURED");
    if (!booking.estimatedArrivalAt || !pirep.flownAt) throw new Error("ACTUAL_TIMING_MISSING");
    const body = { externalPirepId: pirep.id, externalFlightId, operatingDate, operationalStatus: "COMPLETED", actualPassengers: pirep.passengers, actualCargoWeightKg: pirep.freightKg, scheduledArrivalAt: booking.estimatedArrivalAt.toISOString(), actualArrivalAt: pirep.flownAt.toISOString() };
    const response = await fetch(`${baseUrl}/api/v1/pireps`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `pirep:${createHash("sha256").update(pirep.id).digest("hex")}` }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`AMN_HTTP_${response.status}`);
    const receipt = object(await response.json());
    if (typeof receipt.pirepId !== "string" || Object.entries(body).some(([name, value]) => receipt[name] !== value)) throw new Error("AMN_RECEIPT_MISMATCH");
    outcome = { status: "DELIVERED", pirepId: receipt.pirepId, deliveredAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    outcome = { status: "RETRY", errorCode: /^(ALLOCATION_IDENTITY_MISSING|ACTUAL_LOAD_MISSING|ACTUAL_TIMING_MISSING|AMN_NOT_CONFIGURED|AMN_HTTP_\d{3}|AMN_RECEIPT_MISMATCH)$/.test(message) ? message : "AMN_DELIVERY_UNAVAILABLE", attemptedAt: new Date().toISOString() };
  }
  // Compare-and-swap protects telemetry/review JSON and concurrent successful receipts.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await prisma.pirep.findUnique({ where: { id: pirepId }, select: { rawData: true } });
    if (!current || object(object(current.rawData).amnDelivery).status === "DELIVERED") return "DELIVERED";
    const updated = await prisma.pirep.updateMany({ where: { id: pirepId, rawData: { equals: current.rawData ?? Prisma.DbNull } }, data: { rawData: { ...object(current.rawData), amnDelivery: outcome } as Prisma.InputJsonValue } });
    if (updated.count) return outcome.status as string;
  }
  return "RETRY";
}

export async function retryAmnPireps() {
  // Least recently touched first: a failing report cannot starve the remaining queue.
  const reports = await prisma.pirep.findMany({ where: { dataOrigin: "HISPAFLY_NATIVE", status: "accepted", pilotBooking: { is: { dataOrigin: "HISPAFLY_NATIVE", amnPayloadRequestId: { not: null } } }, OR: [{ rawData: { path: ["amnDelivery", "status"], equals: Prisma.AnyNull } }, { NOT: { rawData: { path: ["amnDelivery", "status"], equals: "DELIVERED" } } }] }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 25, select: { id: true } });
  const results = [];
  for (let offset = 0; offset < reports.length; offset += 5) {
    results.push(...await Promise.all(reports.slice(offset, offset + 5).map(async report => ({ pirepId: report.id, status: await deliverAmnPirep(report.id).catch(() => "RETRY") }))));
  }
  return results;
}
