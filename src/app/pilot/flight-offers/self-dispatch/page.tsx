import { randomUUID } from "node:crypto";
import Link from "next/link";
import { NativeSelfDispatchForm } from "@/components/native-self-dispatch-form";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function NativeSelfDispatchPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [pilot, query, routes, aircraft] = await Promise.all([
    requirePilotSession(), searchParams,
    prisma.route.findMany({ where: { active: true, operationalStatus: "ACTIVE", archivedAt: null, dataOrigin: { not: "VAMSYS_LEGACY" }, departureAirportId: { not: null }, arrivalAirportId: { not: null }, scheduledDurationMinutes: { gt: 0 } }, include: { fleetAssignments: true }, orderBy: [{ departure: "asc" }, { arrival: "asc" }, { flightNumber: "asc" }] }),
    prisma.aircraft.findMany({ where: { operationalStatus: "AVAILABLE", archivedAt: null, dataOrigin: { not: "VAMSYS_LEGACY" }, currentAirportId: { not: null }, nativeFleetId: { not: null }, nativeFleet: { operationalStatus: "ACTIVE" }, OR: [{ conditionSnapshot: null }, { conditionSnapshot: { operationalStatus: { notIn: ["AOG", "IN_MAINTENANCE"] }, maintenanceStatus: { notIn: ["REQUIRED", "IN_PROGRESS", "WAITING_MAINTENANCE"] } } }] }, include: { currentAirport: true }, orderBy: { registration: "asc" } }),
  ]);
  const routeOptions = routes.map((route) => ({ id: route.id, flightNumber: route.flightNumber, callsign: route.callsign, departure: route.departure, arrival: route.arrival, departureAirportId: route.departureAirportId!, duration: route.scheduledDurationMinutes!, fleetIds: route.fleetAssignments.map((item) => item.fleetId), altitude: route.cruiseAltitude, userRoute: route.route }));
  const aircraftOptions = aircraft.filter((item) => (item.seatCapacity ?? 0) > 0).map((item) => ({ id: item.id, registration: item.registration, aircraftType: item.aircraftType, airportId: item.currentAirportId!, airportIcao: item.currentAirport?.icao ?? "Unknown", fleetId: item.nativeFleetId!, seatCapacity: item.seatCapacity! }));
  const navigraph = await prisma.navigraphOAuthToken.findUnique({ where: { pilotId: pilot.id }, select: { revokedAt: true } });
  return <PilotPortalShell>
    <div className="booking-detail-back"><Link href="/pilot/flight-offers">← Available flights</Link></div>
    <PageHeading eyebrow="PILOT SELF-DISPATCH" title="Plan your own operation" copy="Start from the aircraft position, choose a reachable destination, calculate the schedule and continue into the existing SimBrief OFP workflow." />
    {query.error && <div className="feedback error">{query.error}</div>}
    <section className="card"><div className="workflow-summary"><div><span>Network</span><strong>{routeOptions.length} active routes</strong></div><div><span>Fleet readiness</span><strong>{aircraftOptions.length} available aircraft</strong></div><div><span>Position control</span><strong>Departure airport enforced</strong></div></div><p className="meta">Only compatible aircraft already positioned at the selected departure airport are offered.</p></section>
    <NativeSelfDispatchForm routes={routeOptions} aircraft={aircraftOptions} idempotencyKey={randomUUID()} simbriefConnected={Boolean(navigraph && !navigraph.revokedAt)}/>
  </PilotPortalShell>;
}
