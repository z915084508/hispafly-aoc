import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { normalizeFlightIdentity } from "@/lib/dispatch/flightIdentity";
import { summarizeSimbriefOfp } from "@/lib/simbrief/response";
import { aircraftConditionReleaseStatus, overallDispatchReleaseStatus } from "./rules";

export type DispatchCheckStatus = "OK" | "WARNING" | "BLOCKED" | "NOT_REQUIRED" | "PENDING";
export interface DispatchReleaseCheck { key: string; label: string; status: DispatchCheckStatus; detail: string; }

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function hasFuelPlan(snapshot: unknown) {
  const root = jsonRecord(snapshot), fuel = jsonRecord(root?.fuel) ?? jsonRecord(jsonRecord(root?.data)?.fuel);
  return Boolean(fuel && Object.values(fuel).some((value) => value !== null && value !== undefined && value !== ""));
}

function previousSignedHash(checks: unknown) {
  const root = jsonRecord(checks);
  return typeof root?.signedContentHash === "string" ? root.signedContentHash : null;
}

export async function evaluateDispatchRelease(input: { ofpBriefingId: string; markSignature?: boolean; releasedByPilotId?: string | null; releasedByStaffId?: string | null }) {
  const ofp = await prisma.ofpBriefing.findUnique({
    where: { id: input.ofpBriefingId },
    include: { flightDispatch: { include: { flightOffer: true } }, dispatchRelease: true },
  });
  if (!ofp) throw new Error("OFP not found.");
  const dispatch = ofp.flightDispatch, offer = dispatch.flightOffer;
  const [location, condition, aircraft, navigraph, maintenance] = await Promise.all([
    prisma.aircraftLocationSnapshot.findUnique({ where: { vamsysAircraftId: offer.vamsysAircraftId } }),
    prisma.aircraftConditionSnapshot.findUnique({ where: { vamsysAircraftId: offer.vamsysAircraftId } }),
    prisma.aircraft.findUnique({ where: { vamsysAircraftId: offer.vamsysAircraftId }, include: { performanceProfile: true } }),
    prisma.navigraphOAuthToken.findUnique({ where: { pilotId: dispatch.pilotId }, select: { revokedAt: true } }),
    prisma.aircraftMaintenanceOrder.findFirst({ where: { vamsysAircraftId: offer.vamsysAircraftId, status: { in: ["REQUIRED", "FERRY_TO_BASE", "WAITING_MAINTENANCE", "IN_PROGRESS"] } } }),
  ]);
  const summary = summarizeSimbriefOfp(ofp.ofpSnapshot);
  const identity = normalizeFlightIdentity({ flightNumber: offer.flightNumber, callsign: offer.callsign });
  const formalOfpGenerated = Boolean(ofp.ofpSnapshot && ["AWAITING_SIGNATURE", "SIGNED"].includes(ofp.status));
  const isFerryAllowed = ["MAINTENANCE_FERRY", "AIRCRAFT_REPOSITION"].includes(offer.offerType) && offer.arrivalIcao === "LEVC";
  const conditionStatus = aircraftConditionReleaseStatus(condition?.operationalStatus ?? null, isFerryAllowed);
  const conditionBlocked = conditionStatus === "BLOCKED";
  const signedHash = input.markSignature && ofp.status === "SIGNED" ? ofp.contentHash : previousSignedHash(ofp.dispatchRelease?.checks);
  const amendedAfterSignature = ofp.status === "SIGNED" && Boolean(signedHash && signedHash !== ofp.contentHash);
  const route = summary.route ?? offer.userRoute;
  const checks: DispatchReleaseCheck[] = [
    { key: "ofpGenerated", label: "OFP generated", status: formalOfpGenerated ? "OK" : "BLOCKED", detail: formalOfpGenerated ? `SimBrief static ID ${ofp.simbriefStaticId}` : "Generate the SimBrief OFP." },
    { key: "flightIdentity", label: "Flight identity valid", status: identity.numericFlightNumber && identity.atcCallsign && !identity.atcCallsign.startsWith("HISPAFLY") ? "OK" : "BLOCKED", detail: `${identity.commercialFlightNumber || "—"} / ${identity.atcCallsign || "—"}` },
    { key: "aircraftAssigned", label: "Aircraft assigned", status: offer.vamsysAircraftId && (aircraft || offer.aircraftRegistration || offer.aircraftType) ? "OK" : "BLOCKED", detail: offer.aircraftRegistration ?? offer.aircraftType ?? offer.vamsysAircraftId ?? "Missing aircraft" },
    { key: "aircraftLocation", label: "Aircraft location valid", status: !location?.currentAirportIcao ? "BLOCKED" : location.currentAirportIcao === offer.departureIcao && (location.status === "AVAILABLE" || (location.status === "RESERVED" && location.reservedByDispatchId === dispatch.id)) ? "OK" : "BLOCKED", detail: location?.currentAirportIcao ? `${location.currentAirportIcao} / required ${offer.departureIcao}` : "Aircraft location is not available." },
    { key: "aircraftCondition", label: "Aircraft condition allows dispatch", status: conditionStatus, detail: condition ? `${condition.operationalStatus} · ${Number(condition.conditionPercent)}%` : "Aircraft condition is not initialized." },
    { key: "fuelPolicy", label: "Fuel policy available", status: hasFuelPlan(ofp.ofpSnapshot) || summary.blockFuel ? "OK" : aircraft?.performanceProfile?.maxFuelKg ? "WARNING" : "BLOCKED", detail: summary.blockFuel ? `Block fuel ${summary.blockFuel} kg` : aircraft?.performanceProfile?.maxFuelKg ? "Aircraft fuel limits available; SimBrief fuel summary was not recognized." : "No OFP fuel plan or aircraft fuel profile." },
    { key: "route", label: "Route available", status: route ? "OK" : "BLOCKED", detail: route ?? "Route is missing." },
    { key: "alternate", label: "Alternate available if required", status: summary.alternate ? "OK" : "WARNING", detail: summary.alternate ?? "No alternate identified; verify whether one is required." },
    { key: "takeoffPerformance", label: "Takeoff performance completed if required", status: "NOT_REQUIRED", detail: "Not required by the current route policy." },
    { key: "landingPerformance", label: "Landing performance completed if required", status: "NOT_REQUIRED", detail: "Not required by the current route policy." },
    { key: "maintenanceRestriction", label: "No blocking maintenance restriction", status: maintenance || conditionBlocked ? "BLOCKED" : "OK", detail: maintenance ? `Active maintenance order: ${maintenance.status}` : conditionBlocked ? "Aircraft condition restricts dispatch." : "No blocking restriction." },
    { key: "navigraph", label: "Navigraph connection valid", status: navigraph && !navigraph.revokedAt ? "OK" : "BLOCKED", detail: navigraph && !navigraph.revokedAt ? "Connected" : "Reconnect Navigraph / SimBrief." },
    { key: "ofpIntegrity", label: "OFP unchanged after signature", status: amendedAfterSignature ? "BLOCKED" : ofp.status === "SIGNED" ? "OK" : "PENDING", detail: amendedAfterSignature ? "OFP content changed after signature; re-sign required." : ofp.status === "SIGNED" ? "Signed content hash matches." : "Checked when the pilot signs." },
    { key: "pilotSigned", label: "Pilot signed OFP", status: ofp.status === "SIGNED" && !amendedAfterSignature ? "OK" : "PENDING", detail: ofp.status === "SIGNED" ? "Pilot signature recorded." : "Pilot signature is still required." },
  ];
  const blockingItems = checks.filter((item) => item.status === "BLOCKED").map((item) => item.detail);
  const warnings = checks.filter((item) => item.status === "WARNING").map((item) => item.detail);
  warnings.push("Weather status is not yet integrated; review current operational weather before dispatch.");
  const status = overallDispatchReleaseStatus({ voided: ofp.status === "VOIDED", blockingCount: blockingItems.length, signed: ofp.status === "SIGNED", generated: formalOfpGenerated });
  const riskLevel = blockingItems.length ? "BLOCKED" : warnings.length > 1 ? "HIGH" : warnings.length ? "MEDIUM" : "LOW";
  const ofpCheckStatus = checks.find((item) => item.key === "ofpGenerated")!.status;
  const fuelCheckStatus = checks.find((item) => item.key === "fuelPolicy")!.status;
  const aircraftConditionStatus = conditionStatus;
  const data = {
    status, riskLevel, ofpCheckStatus, fuelCheckStatus, aircraftConditionStatus,
    takeoffPerformanceStatus: "NOT_REQUIRED", landingPerformanceStatus: "NOT_REQUIRED",
    weatherStatus: "UNKNOWN", alternateStatus: summary.alternate ? "OK" : "WARNING", etopsStatus: "NOT_REQUIRED",
    checks: { items: checks, signedContentHash: signedHash } as unknown as Prisma.InputJsonValue,
    warnings: warnings as Prisma.InputJsonValue,
    blockingItems: blockingItems as Prisma.InputJsonValue,
    releasedAt: status === "SIGNED" ? ofp.signedAt ?? new Date() : null,
    releasedByPilotId: status === "SIGNED" ? input.releasedByPilotId ?? ofp.signedByPilotId ?? ofp.dispatchRelease?.releasedByPilotId : null,
    releasedByStaffId: status === "SIGNED" ? input.releasedByStaffId ?? ofp.dispatchRelease?.releasedByStaffId : null,
  };
  const created = !ofp.dispatchRelease;
  const previousStatus = ofp.dispatchRelease?.status;
  const release = await prisma.dispatchRelease.upsert({ where: { ofpBriefingId: ofp.id }, create: { ofpBriefingId: ofp.id, ...data }, update: data });
  await writeAuditLogSafely({ action: created ? "DISPATCH_RELEASE_CREATED" : "DISPATCH_RELEASE_UPDATED", entityType: "DispatchRelease", entityId: release.id, message: `Dispatch release evaluated as ${status}.`, metadata: { ofpBriefingId: ofp.id, status, riskLevel, blockingItems: blockingItems.length, warnings: warnings.length } });
  if (status !== previousStatus && ["BLOCKED", "READY", "SIGNED"].includes(status)) await writeAuditLogSafely({ action: `DISPATCH_RELEASE_${status}`, entityType: "DispatchRelease", entityId: release.id, message: `Dispatch release status changed to ${status}.`, metadata: { ofpBriefingId: ofp.id, previousStatus: previousStatus ?? null, riskLevel } });
  return release;
}

export async function assertDispatchReleaseAllowsFinalDispatch(ofpBriefingId: string, pilotId: string) {
  const release = await evaluateDispatchRelease({ ofpBriefingId });
  if (release.status !== "SIGNED" || release.releasedByPilotId !== pilotId) throw new Error(release.status === "BLOCKED" ? "Dispatch Release is blocked. Resolve all blocking items before Final Dispatch." : "Dispatch Release is not signed and ready for Final Dispatch.");
  return release;
}
