import { randomUUID } from "node:crypto";
import Link from "next/link";
import { NativeSelfDispatchForm } from "@/components/native-self-dispatch-form";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { resolveAircraftState } from "@/lib/native-flight/aircraft-state";
import { distanceKm, jumpseatCostCents, resolvePilotPosition } from "@/lib/pilot/position";
import { PilotJumpseatForm } from "@/components/pilot-jumpseat-form";
import { setInitialCrewPositionAction } from "./actions";

export const dynamic = "force-dynamic";
const OCCUPIED_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "DISPATCH_PENDING", "DISPATCHED", "IN_PROGRESS", "BOOKED"] as const;
export default async function NativeSelfDispatchPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const pilot = await requirePilotSession();
  const [query, position, routes, aircraft, airports] = await Promise.all([
    searchParams, resolvePilotPosition(pilot.id),
    prisma.route.findMany({ where: { active: true, operationalStatus: "ACTIVE", archivedAt: null, departureAirportId: { not: null }, arrivalAirportId: { not: null }, scheduledDurationMinutes: { gt: 0 }, nativeBookings: { none: { status: { in: [...OCCUPIED_BOOKING_STATUSES] } } } }, include: { fleetAssignments: true }, orderBy: [{ departure: "asc" }, { arrival: "asc" }, { flightNumber: "asc" }] }),
    prisma.aircraftLocationSnapshot.findMany({ where: { status: "AVAILABLE", currentAirportId: { not: null }, aircraftId: { not: null }, aircraft: { archivedAt: null, operationMode: { in: ["FREE", "FLEX"] }, nativeFleetId: { not: null }, nativeFleet: { operationalStatus: "ACTIVE" }, OR: [{ conditionSnapshot: null }, { conditionSnapshot: { operationalStatus: { notIn: ["AOG", "IN_MAINTENANCE"] }, maintenanceStatus: { notIn: ["REQUIRED", "IN_PROGRESS", "WAITING_MAINTENANCE"] } } }] } }, include: { currentAirport: true, aircraft: true }, orderBy: { registration: "asc" } }),
    prisma.airport.findMany({ where: { status: "ACTIVE", archivedAt: null, latitude: { not: null }, longitude: { not: null } }, orderBy: { icao: "asc" } }),
  ]);

  if (!position.airport) return <PilotPortalShell>
    <PageHeading eyebrow="WELCOME TO HISPAFLY" title="Choose your initial crew position" copy="Select the airport where you want to begin operations. This free selection is available only once; later movements use completed flights or Jumpseat." />
    {query.error && <div className="feedback error">{query.error}</div>}
    <section className="card" style={{ maxWidth: 760 }}>
      <form action={setInitialCrewPositionAction} className="form-grid">
        <label>Initial airport
          <select name="airportId" required defaultValue="">
            <option value="" disabled>Select an active airport</option>
            {airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.icao} · {airport.name}</option>)}
          </select>
        </label>
        <p className="meta">Staff Operations can correct this position later when necessary. After setup, use Jumpseat to move without flying.</p>
        <button className="button" type="submit">SET CREW POSITION</button>
      </form>
    </section>
  </PilotPortalShell>;

  const routeOptions = routes.map((route) => ({ id: route.id, flightNumber: route.flightNumber, callsign: route.callsign, departure: route.departure, arrival: route.arrival, departureAirportId: route.departureAirportId!, duration: route.scheduledDurationMinutes!, fleetIds: route.fleetAssignments.map((item) => item.fleetId), altitude: route.cruiseAltitude, userRoute: route.route }));
  const departureRouteCount = routeOptions.filter((route) => route.departureAirportId === position.airport!.id).length;
  const aircraftOptions = aircraft.filter((item) => item.aircraft && (item.aircraft.seatCapacity ?? 0) > 0 && item.aircraft.nativeFleetId).map((item) => { const state = resolveAircraftState({ operationalStatus: item.aircraft!.operationalStatus, currentAirportId: item.aircraft!.currentAirportId, locationSnapshot: item }); return { id: item.aircraft!.id, registration: item.registration ?? item.aircraft!.registration, aircraftType: item.aircraftType ?? item.aircraft!.aircraftType, airportId: item.currentAirportId!, airportIcao: item.currentAirport?.icao ?? item.currentAirportIcao ?? "Unknown", fleetId: item.aircraft!.nativeFleetId!, seatCapacity: item.aircraft!.seatCapacity!, source: item.source, updatedAt: item.updatedAt.toISOString(), stale: state.stale, external: state.external }; });
  const navigraph = await prisma.navigraphOAuthToken.findUnique({ where: { pilotId: pilot.id }, select: { revokedAt: true } });
  return <PilotPortalShell>
    <div className="booking-detail-back"><Link href="/pilot/flight-offers">← Available flights</Link></div>
    <PageHeading eyebrow="PILOT SELF-DISPATCH" title="Plan your own operation" copy="Start from the aircraft position, choose a reachable destination, calculate the schedule and continue into the existing SimBrief OFP workflow." />
    {query.error && <div className="feedback error">{query.error}</div>}
    {query.success && <div className="feedback success">{query.success}</div>}
    <section className="card"><div className="workflow-summary"><div><span>Routes from {position.airport.icao}</span><strong>{departureRouteCount} outbound routes</strong><Link href={`/pilot/routes?airport=${position.airport.icao}`}>Open route map →</Link></div><div><span>Fleet readiness</span><strong>{aircraftOptions.filter((item) => item.airportId === position.airport!.id).length} aircraft at {position.airport.icao}</strong></div><div><span>Position control</span><strong>{position.airport.icao}</strong></div></div><p className="meta">Your departure airport is automatically locked to your current crew position. Only compatible aircraft at {position.airport.icao} are offered.</p></section>
    <PilotJumpseatForm currentIcao={position.airport.icao} balanceCents={position.pilot.walletBalanceCents} airports={airports.flatMap((airport) => { if (airport.id === position.airport!.id) return []; const km = distanceKm(position.airport!, airport); return km == null ? [] : [{ id: airport.id, icao: airport.icao, name: airport.name, distanceKm: km, costCents: jumpseatCostCents(km) }]; })}/>
    <NativeSelfDispatchForm routes={routeOptions} aircraft={aircraftOptions} idempotencyKey={randomUUID()} simbriefConnected={Boolean(navigraph && !navigraph.revokedAt)} pilotAirportIcao={position.airport.icao}/>
  </PilotPortalShell>;
}
