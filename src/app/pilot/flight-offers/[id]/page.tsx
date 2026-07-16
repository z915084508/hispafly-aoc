import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { PageHeading } from "@/components/page-heading";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { checkPilotEligibility } from "@/lib/native-flight/booking";
import { checkAircraftAvailability } from "@/lib/native-flight/availability";
import { bookNativeFlightAction } from "../actions";

export default async function FlightBookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, query, pilot] = await Promise.all([params, searchParams, requirePilotSession()]);
  const flight = await prisma.flight.findUnique({ where: { id }, include: { route: true, fleet: true, assignedAircraft: { include: { currentAirport: true, conditionSnapshot: true } } } });
  if (!flight) notFound();
  const eligibility = await checkPilotEligibility(pilot.id, flight);
  const aircraft = flight.assignedAircraftId ? [] : await prisma.aircraft.findMany({ where: { operationalStatus: "AVAILABLE", ...(flight.fleetId ? { nativeFleetId: flight.fleetId } : {}), ...(flight.departureAirportId ? { currentAirportId: flight.departureAirportId } : {}) }, include: { currentAirport: true }, orderBy: { registration: "asc" } });
  const availableAircraft = [];
  for (const item of aircraft) {
    const result = await checkAircraftAvailability({ aircraftId: item.id, routeId: flight.routeId, departureAirportId: flight.departureAirportId, startsAt: flight.scheduledDeparture, endsAt: flight.scheduledArrival });
    if (result.allowed) availableAircraft.push(item);
  }
  return <PilotPortalShell><PageHeading eyebrow="BOOKING CONFIRMATION" title={`${flight.flightNumber} · ${flight.departureIcao} → ${flight.arrivalIcao}`} copy="Review all operational details before confirming this booking."/>
    {query.error && <div className="feedback error">{query.error}</div>}
    <section className="card"><div className="workflow-summary"><div><span>Operating date</span><strong>{flight.operatingDate.toISOString().slice(0, 10)}</strong></div><div><span>Local time</span><strong>{flight.departureLocalTime} {flight.departureTimezone} → {flight.arrivalLocalTime} {flight.arrivalTimezone}</strong></div><div><span>UTC</span><strong>{flight.scheduledDeparture.toISOString()} → {flight.scheduledArrival.toISOString()}</strong></div><div><span>Fleet</span><strong>{flight.fleet?.code ?? "Assigned during dispatch"}</strong></div><div><span>Aircraft</span><strong>{flight.assignedAircraft?.registration ?? "Selection or later assignment"}</strong></div><div><span>Booking closes</span><strong>{flight.bookingCloseAt?.toISOString() ?? "At departure"}</strong></div></div>
      {eligibility.blockingReasons.map((reason) => <div className="feedback error" key={reason}>{reason}</div>)}{eligibility.warnings.map((warning) => <div className="notice" key={warning}>{warning}</div>)}
      <form action={bookNativeFlightAction}><input type="hidden" name="flightId" value={flight.id}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/>{!flight.assignedAircraftId && <label>Aircraft<select name="aircraftId"><option value="">Aircraft pending assignment</option>{availableAircraft.map((item) => <option key={item.id} value={item.id}>{item.registration} · {item.currentAirport?.icao}</option>)}</select></label>}<p className="meta">You may cancel before Dispatch. Dispatched, active, and completed bookings require an Operations-controlled workflow.</p><button className="button" disabled={!eligibility.allowed}>Confirm booking</button></form>
    </section>
  </PilotPortalShell>;
}
