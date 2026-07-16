import { randomUUID } from "node:crypto";
import { NativeCutoverClassification, NativeCutoverReviewStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";

export type InventoryRow = {
  entityType: string;
  total: number;
  nativeReady: number;
  legacyLinked: number;
  legacyUnresolved: number;
  historicalOnly: number;
  invalid: number;
  duplicateCandidates: number;
  missingRelations: number;
};

function duplicateValueCount(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = value?.trim().toUpperCase();
    if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
}

async function originCounts(model: { count(args?: unknown): Promise<number> }, relationWhere: Record<string, unknown>, historicalOnly = false): Promise<Omit<InventoryRow, "entityType">> {
  const [total, nativeReady, legacyTotal, legacyLinked, invalid] = await Promise.all([
    model.count(),
    model.count({ where: { dataOrigin: "HISPAFLY_NATIVE", ...relationWhere } }),
    model.count({ where: { dataOrigin: { not: "HISPAFLY_NATIVE" } } }),
    model.count({ where: { dataOrigin: { not: "HISPAFLY_NATIVE" }, ...relationWhere } }),
    model.count({ where: { dataOrigin: "HISPAFLY_NATIVE", NOT: relationWhere } }),
  ]);
  const unresolved = Math.max(0, legacyTotal - legacyLinked);
  return { total, nativeReady, legacyLinked: historicalOnly ? 0 : legacyLinked, legacyUnresolved: historicalOnly ? 0 : unresolved, historicalOnly: historicalOnly ? legacyTotal : 0, invalid, duplicateCandidates: 0, missingRelations: invalid + (historicalOnly ? 0 : unresolved) };
}

export async function getMigrationInventory(): Promise<InventoryRow[]> {
  const [rows, airports, routes, fleets, aircraft] = await Promise.all([
    Promise.all([
    originCounts(prisma.airport, { icao: { not: "" } }).then((x) => ({ entityType: "Airport", ...x })),
    originCounts(prisma.route, { departureAirportId: { not: null }, arrivalAirportId: { not: null } }).then((x) => ({ entityType: "Route", ...x })),
    originCounts(prisma.fleet, { code: { not: "" } }).then((x) => ({ entityType: "Fleet", ...x })),
    originCounts(prisma.aircraft, { registration: { not: null }, nativeFleetId: { not: null } }).then((x) => ({ entityType: "Aircraft", ...x })),
    originCounts(prisma.flightSchedule, { routeId: { not: "" } }).then((x) => ({ entityType: "Schedule", ...x })),
    originCounts(prisma.flight, { routeId: { not: "" }, departureAirportId: { not: null }, arrivalAirportId: { not: null } }).then((x) => ({ entityType: "Flight", ...x })),
    originCounts(prisma.flightOffer, { flightId: { not: null }, routeId: { not: null } }).then((x) => ({ entityType: "FlightOffer", ...x })),
    originCounts(prisma.pilotBooking, { flightId: { not: null }, routeId: { not: null } }).then((x) => ({ entityType: "Booking", ...x })),
    originCounts(prisma.flightDispatch, { bookingId: { not: null }, flightId: { not: null }, aircraftId: { not: null } }).then((x) => ({ entityType: "Dispatch", ...x })),
    originCounts(prisma.pirep, { pilotId: { not: "" } }, true).then((x) => ({ entityType: "PIREP", ...x })),
    ]),
    prisma.airport.findMany({ select: { icao: true } }),
    prisma.route.findMany({ select: { departure: true, arrival: true, flightNumber: true, routeCode: true } }),
    prisma.fleet.findMany({ select: { code: true } }),
    prisma.aircraft.findMany({ select: { registration: true } }),
  ]);
  rows.find((row) => row.entityType === "Airport")!.duplicateCandidates = duplicateValueCount(airports.map(({ icao }) => icao));
  rows.find((row) => row.entityType === "Route")!.duplicateCandidates = duplicateValueCount(routes.map((route) => `${route.departure}:${route.arrival}:${route.routeCode ?? route.flightNumber ?? ""}`));
  rows.find((row) => row.entityType === "Fleet")!.duplicateCandidates = duplicateValueCount(fleets.map(({ code }) => code));
  rows.find((row) => row.entityType === "Aircraft")!.duplicateCandidates = duplicateValueCount(aircraft.map(({ registration }) => registration));
  const locations = await prisma.aircraftLocationSnapshot.count();
  const linkedLocations = await prisma.aircraftLocationSnapshot.count({ where: { aircraftId: { not: null } } });
  rows.splice(9, 0, { entityType: "AircraftLocation", total: locations, nativeReady: 0, legacyLinked: linkedLocations, legacyUnresolved: locations - linkedLocations, historicalOnly: 0, invalid: 0, duplicateCandidates: 0, missingRelations: locations - linkedLocations });
  return rows;
}

export async function refreshReviewQueue() {
  const candidates = await Promise.all([
    prisma.route.findMany({ where: { OR: [{ departureAirportId: null }, { arrivalAirportId: null }] }, select: { id: true, dataOrigin: true, routeCode: true, departure: true, arrival: true, vamsysRouteId: true } }),
    prisma.aircraft.findMany({ where: { OR: [{ registration: null }, { nativeFleetId: null }] }, select: { id: true, dataOrigin: true, registration: true, aircraftType: true, vamsysAircraftId: true } }),
    prisma.flightSchedule.findMany({ where: { route: { OR: [{ departureAirportId: null }, { arrivalAirportId: null }] } }, select: { id: true, dataOrigin: true, code: true, routeId: true } }),
    prisma.flight.findMany({ where: { OR: [{ departureAirportId: null }, { arrivalAirportId: null }] }, select: { id: true, dataOrigin: true, flightNumber: true, routeId: true, operatingDate: true } }),
    prisma.flightOffer.findMany({ where: { OR: [{ flightId: null }, { routeId: null }] }, select: { id: true, dataOrigin: true, flightNumber: true, departureIcao: true, arrivalIcao: true, vamsysRouteId: true, vamsysAircraftId: true } }),
    prisma.pilotBooking.findMany({ where: { OR: [{ flightId: null }, { routeId: null }] }, select: { id: true, dataOrigin: true, pilotId: true, flightNumber: true, departureIcao: true, arrivalIcao: true, vamsysBookingId: true } }),
    prisma.flightDispatch.findMany({ where: { OR: [{ bookingId: null }, { flightId: null }, { aircraftId: null }] }, select: { id: true, dataOrigin: true, pilotId: true, bookingId: true, flightId: true, aircraftId: true, vamsysBookingId: true } }),
    prisma.aircraftLocationSnapshot.findMany({ where: { aircraftId: null }, select: { id: true, registration: true, aircraftType: true, currentAirportIcao: true, vamsysAircraftId: true } }),
  ]);
  const typed = [
    ...candidates[0].map((source) => ({ entityType: "Route", source })),
    ...candidates[1].map((source) => ({ entityType: "Aircraft", source })),
    ...candidates[2].map((source) => ({ entityType: "Schedule", source })),
    ...candidates[3].map((source) => ({ entityType: "Flight", source })),
    ...candidates[4].map((source) => ({ entityType: "FlightOffer", source })),
    ...candidates[5].map((source) => ({ entityType: "Booking", source })),
    ...candidates[6].map((source) => ({ entityType: "Dispatch", source })),
    ...candidates[7].map((source) => ({ entityType: "AircraftLocation", source })),
  ];
  for (const { entityType, source } of typed) {
    const historical = "dataOrigin" in source && source.dataOrigin === "VAMSYS_LEGACY";
    await prisma.nativeCutoverReviewItem.upsert({
      where: { entityType_sourceId_issueType: { entityType, sourceId: source.id, issueType: "MISSING_NATIVE_RELATION" } },
      create: {
        entityType, sourceId: source.id, issueType: "MISSING_NATIVE_RELATION",
        classification: historical ? NativeCutoverClassification.LEGACY_UNRESOLVED : NativeCutoverClassification.INVALID_REQUIRES_REVIEW,
        sourceSnapshot: source as unknown as Prisma.InputJsonValue,
        affectedFields: entityType === "AircraftLocation" ? ["aircraftId"] : ["nativeRelations"],
        warnings: ["No unique exact Native target was selected automatically."],
      },
      update: { sourceSnapshot: source as unknown as Prisma.InputJsonValue },
    });
  }
  return { scanned: typed.length };
}

export async function previewReviewResolution(reviewItemId: string, targetNativeId: string | null, decision: "CONFIRM" | "REJECT" | "HISTORICAL_ONLY") {
  const item = await prisma.nativeCutoverReviewItem.findUnique({ where: { id: reviewItemId } });
  if (!item) throw new Error("Review item not found.");
  if (decision === "CONFIRM" && !targetNativeId) throw new Error("A Native target is required.");
  return {
    sourceRecord: item.sourceSnapshot,
    proposedNativeTarget: targetNativeId,
    matchingBasis: "STAFF_EXPLICIT_SELECTION",
    confidence: "MANUAL_CONFIRMED",
    decision,
    fieldsChanged: ["review status", "resolvedTargetId"],
    downstreamRecords: item.downstreamImpact,
    conflicts: [],
    warnings: item.warnings,
    fieldsNotChanged: ["legacy IDs", "raw payload", "historical financial and operational records"],
  };
}

async function validateNativeTarget(entityType: string, targetNativeId: string) {
  const found = entityType === "Airport" ? await prisma.airport.findFirst({ where: { id: targetNativeId, dataOrigin: "HISPAFLY_NATIVE" }, select: { id: true } })
    : entityType === "Route" ? await prisma.route.findFirst({ where: { id: targetNativeId, dataOrigin: "HISPAFLY_NATIVE" }, select: { id: true } })
    : entityType === "Fleet" ? await prisma.fleet.findFirst({ where: { id: targetNativeId, dataOrigin: "HISPAFLY_NATIVE" }, select: { id: true } })
    : ["Aircraft", "AircraftLocation"].includes(entityType) ? await prisma.aircraft.findFirst({ where: { id: targetNativeId, dataOrigin: "HISPAFLY_NATIVE" }, select: { id: true } })
    : entityType === "Schedule" ? await prisma.flightSchedule.findFirst({ where: { id: targetNativeId, dataOrigin: "HISPAFLY_NATIVE" }, select: { id: true } })
    : ["Flight", "FlightOffer", "Booking"].includes(entityType) ? await prisma.flight.findFirst({ where: { id: targetNativeId, dataOrigin: "HISPAFLY_NATIVE" }, select: { id: true } })
    : entityType === "Dispatch" ? await prisma.flightDispatch.findFirst({ where: { id: targetNativeId, dataOrigin: "HISPAFLY_NATIVE" }, select: { id: true } })
    : null;
  if (!found) throw new Error("The selected target is not a valid HispaFly Native entity.");
}

export async function executeReviewResolution(input: { reviewItemId: string; targetNativeId: string | null; decision: "CONFIRM" | "REJECT" | "HISTORICAL_ONLY"; note?: string; actorStaffId: string; operationKey?: string }) {
  const operationKey = input.operationKey ?? randomUUID();
  const existing = await prisma.nativeCutoverOperation.findUnique({ where: { operationKey } });
  if (existing) return existing;
  const preview = await previewReviewResolution(input.reviewItemId, input.targetNativeId, input.decision);
  const previewItem = await prisma.nativeCutoverReviewItem.findUnique({ where: { id: input.reviewItemId }, select: { entityType: true } });
  if (input.decision === "CONFIRM" && input.targetNativeId && previewItem) await validateNativeTarget(previewItem.entityType, input.targetNativeId);
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.nativeCutoverReviewItem.findUnique({ where: { id: input.reviewItemId } });
    if (!item) throw new Error("Review item not found.");
    if (item.status !== NativeCutoverReviewStatus.PENDING) throw new Error("Review item is already resolved.");
    const operation = await tx.nativeCutoverOperation.create({ data: { operationKey, actorStaffId: input.actorStaffId, entityType: item.entityType, action: input.decision, status: "RUNNING", requestedIds: [item.id], startedAt: new Date() } });
    const status = input.decision === "CONFIRM" ? NativeCutoverReviewStatus.CONFIRMED : input.decision === "REJECT" ? NativeCutoverReviewStatus.REJECTED : NativeCutoverReviewStatus.HISTORICAL_ONLY;
    const updated = await tx.nativeCutoverReviewItem.update({ where: { id: item.id }, data: { status, resolvedTargetId: input.targetNativeId, resolutionNote: input.note, resolvedByStaffId: input.actorStaffId, resolvedAt: new Date(), classification: input.decision === "CONFIRM" ? "LEGACY_LINKED" : "LEGACY_HISTORICAL_ONLY" } });
    await tx.nativeCutoverOperationEntry.create({ data: { operationId: operation.id, reviewItemId: item.id, entityType: item.entityType, sourceId: item.sourceId, targetNativeId: input.targetNativeId, action: input.decision, matchingReason: "STAFF_EXPLICIT_SELECTION", beforeValue: item as unknown as Prisma.InputJsonValue, afterValue: updated as unknown as Prisma.InputJsonValue, result: "SUCCESS" } });
    return tx.nativeCutoverOperation.update({ where: { id: operation.id }, data: { status: "COMPLETED", succeeded: 1, summary: preview as unknown as Prisma.InputJsonValue, completedAt: new Date() } });
  });
  await writeAuditLogSafely({ staffUserId: input.actorStaffId, action: "NATIVE_CUTOVER_REVIEW_RESOLVED", entityType: "NativeCutoverReviewItem", entityId: input.reviewItemId, message: `Native cutover review resolved as ${input.decision}.`, metadata: { operationId: result.id, targetNativeId: input.targetNativeId } });
  return result;
}

export async function executeReviewBatch(input: { items: Array<{ reviewItemId: string; targetNativeId: string | null; decision: "CONFIRM" | "REJECT" | "HISTORICAL_ONLY"; note?: string }>; actorStaffId: string; batchKey: string }) {
  if (!input.items.length || input.items.length > 50) throw new Error("Select between 1 and 50 review items.");
  const results: Array<{ reviewItemId: string; status: "SUCCESS" | "FAILED"; operationId?: string; error?: string }> = [];
  for (const [index, item] of input.items.entries()) {
    try {
      const operation = await executeReviewResolution({ ...item, actorStaffId: input.actorStaffId, operationKey: `${input.batchKey}:${index}:${item.reviewItemId}` });
      results.push({ reviewItemId: item.reviewItemId, status: "SUCCESS", operationId: operation.id });
    } catch (error) {
      results.push({ reviewItemId: item.reviewItemId, status: "FAILED", error: error instanceof Error ? error.message : "Unknown failure" });
    }
  }
  return { succeeded: results.filter((item) => item.status === "SUCCESS").length, failed: results.filter((item) => item.status === "FAILED").length, results };
}

export async function getCutoverDashboard() {
  const [inventory, pending, invalid, recentOperations] = await Promise.all([
    getMigrationInventory(),
    prisma.nativeCutoverReviewItem.count({ where: { status: "PENDING" } }),
    prisma.nativeCutoverReviewItem.count({ where: { status: "PENDING", classification: "INVALID_REQUIRES_REVIEW" } }),
    prisma.nativeCutoverOperation.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const nativeReady = inventory.reduce((sum, row) => sum + row.nativeReady, 0);
  const unresolved = inventory.reduce((sum, row) => sum + row.legacyUnresolved, 0);
  const requiredChain = ["Airport", "Route", "Fleet", "Aircraft", "Schedule", "Flight", "Booking", "Dispatch"];
  const nativeChainComplete = requiredChain.every((entityType) => (inventory.find((row) => row.entityType === entityType)?.nativeReady ?? 0) > 0);
  const status = invalid || !nativeChainComplete ? "NOT_READY" : pending || unresolved ? "REVIEW_REQUIRED" : "READY_FOR_ACARS";
  return { inventory, nativeReady, unresolved, invalid, pending, recentOperations, acarsContractVersion: "1.0", runtimeDependencyAudit: "LEGACY_DISABLED_REVIEWED", disabledIntegrations: ["vAMSYS OAuth", "vAMSYS cron", "vAMSYS webhook processing", "vAMSYS Operations API"], environmentReadiness: "VAMSYS_ENV_NOT_REQUIRED", endToEndStatus: nativeChainComplete ? "NATIVE_CHAIN_PRESENT" : "NOT_EXECUTABLE_NO_NATIVE_CHAIN", status };
}
