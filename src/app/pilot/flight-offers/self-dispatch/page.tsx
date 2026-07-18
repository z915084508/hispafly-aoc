import { randomUUID } from "node:crypto";
import Link from "next/link";
import { NativeSelfDispatchForm } from "@/components/native-self-dispatch-form";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { resolveAircraftState } from "@/lib/native-flight/aircraft-state";

export const dynamic = "force-dynamic";
export default async function NativeSelfDispatchPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [pilot, query, routes, aircraft] = await Promise.all([
    requirePilotSession(), searchParams,
    prisma.route.findMany({ where: { active: true, operationalStatus: "ACTIVE", archivedAt: null, dataOrigin: { not: "VAMSYS_LEGACY" }, departureAirportId: { not: null }, arrivalAirportId: { not: null }, scheduledDurationMinutes: { gt: 0 } }, include: { fleetAssignments: true }, orderBy: [{ departure: "asc" }, { arrival: "asc" }, { flightNumber: "asc" }] }),
    prisma.aircraftLocationSnapshot.findMany({ where: { status: "AVAILABLE", currentAirportId: { not: null }, aircraftId: { not: null }, aircraft: { archivedAt: null, dataOrigin: { not: "VAMSYS_LEGACY" }, nativeFleetId: { not: null }, nativeFleet: { operationalStatus: "ACTIVE" }, OR: [{ conditionSnapshot: null }, { conditionSnapshot: { operationalStatus: { notIn: ["AOG", "IN_MAINTENANCE"] }, maintenanceStatus: { notIn: ["REQUIRED", "IN_PROGRESS", "WAITING_MAINTENANCE"] } } }] } }, include: { currentAirport: true, aircraft: true }, orderBy: { registration: "asc" } }),
  ]);
  const routeOptions = routes.map((route) => ({ id: route.id, flightNumber: route.flightNumber, callsign: route.callsign, departure: route.departure, arrival: route.arrival, departureAirportId: route.departureAirportId!, duration: route.scheduledDurationMinutes!, fleetIds: route.fleetAssignments.map((item) => item.fleetId), altitude: route.cruiseAltitude, userRoute: route.route }));
  const aircraftOptions = aircraft.filter((item) => item.aircraft && (item.aircraft.seatCapacity ?? 0) > 0 && item.aircraft.nativeFleetId).map((item) => { const state = resolveAircraftState({ operationalStatus: item.aircraft!.operationalStatus, currentAirportId: item.aircraft!.currentAirportId, locationSnapshot: item }); return { id: item.aircraft!.id, registration: item.registration ?? item.aircraft!.registration, aircraftType: item.aircraftType ?? item.aircraft!.aircraftType, airportId: item.currentAirportId!, airportIcao: item.currentAirport?.icao ?? item.currentAirportIcao ?? "Unknown", fleetId: item.aircraft!.nativeFleetId!, seatCapacity: item.aircraft!.seatCapacity!, source: item.source, updatedAt: item.updatedAt.toISOString(), stale: state.stale, external: state.external }; });
  const navigraph = await prisma.navigraphOAuthToken.findUnique({ where: { pilotId: pilot.id }, select: { revokedAt: true } });
  return <PilotPortalShell>
    <div className="booking-detail-back"><Link href="/pilot/flight-offers">← Available flights</Link></div>
    <PageHeading eyebrow="PILOT SELF-DISPATCH" title="Plan your own operation" copy="Start from the aircraft position, choose a reachable destination, calculate the schedule and continue into the existing SimBrief OFP workflow." />
    {query.error && <div className="feedback error">{query.error}</div>}
    <section className="card"><div className="workflow-summary"><div><span>Network</span><strong>{routeOptions.length} active routes</strong></div><div><span>Fleet readiness</span><strong>{aircraftOptions.length} available aircraft</strong></div><div><span>Position control</span><strong>Departure airport enforced</strong></div></div><p className="meta">Only compatible aircraft already positioned at the selected departure airport are offered.</p></section>
    <NativeSelfDispatchForm routes={routeOptions} aircraft={aircraftOptions} idempotencyKey={randomUUID()} simbriefConnected={Boolean(navigraph && !navigraph.revokedAt)}/>
  </PilotPortalShell>;
}
