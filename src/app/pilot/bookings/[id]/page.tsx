import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { checkPilotEligibility } from "@/lib/native-flight/booking";
import { cancelPilotBookingAction } from "../actions";
import { createPilotDispatchAction } from "../../dispatch/actions";
import { randomUUID } from "node:crypto";

export default async function PilotBookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ id }, query, pilot] = await Promise.all([params, searchParams, requirePilotSession()]);
  const booking = await prisma.pilotBooking.findFirst({ where: { id, pilotId: pilot.id }, include: { flight: true, route: true, fleet: true, aircraft: { include: { currentAirport: true } }, dispatch: { include: { ofpBriefing: true } }, matchedPirep: true } });
  if (!booking) notFound();
  const eligibility = booking.flight ? await checkPilotEligibility(pilot.id, booking.flight) : null;
  const cancellable = booking.dataOrigin !== "VAMSYS_LEGACY" && ["PENDING","CONFIRMED","BOOKED"].includes(booking.status) && !booking.dispatch;
  return <PilotPortalShell><PageHeading eyebrow={booking.dataOrigin === "VAMSYS_LEGACY" ? "HISTORICAL · EXTERNAL SYSTEM UNAVAILABLE" : "NATIVE BOOKING"} title={`${booking.flightNumber ?? "Flight"} · ${booking.departureIcao} → ${booking.arrivalIcao}`} copy={`Booking status: ${booking.status}`}/>
    {query.error && <div className="feedback error">{query.error}</div>}{query.success && <div className="feedback success">{query.success}</div>}
    <section className="card"><div className="workflow-summary"><div><span>Departure</span><strong>{booking.selectedDepartureAt.toISOString()}</strong></div><div><span>Arrival</span><strong>{booking.estimatedArrivalAt?.toISOString() ?? "—"}</strong></div><div><span>Fleet</span><strong>{booking.fleet?.code ?? booking.vamsysFleetId ?? "—"}</strong></div><div><span>Aircraft</span><strong>{booking.aircraft?.registration ?? booking.aircraftRegistration ?? "Pending assignment"}</strong></div><div><span>Dispatch</span><strong>{booking.dispatch?.status ?? "Not started"}</strong></div><div><span>Legacy reference</span><strong>{booking.legacyReference ?? booking.vamsysBookingId ?? "None"}</strong></div></div>
      {eligibility?.warnings.map((warning) => <div className="notice" key={warning}>{warning}</div>)}
      {booking.dispatch?.ofpBriefing && <a className="button" href={`/pilot/ofp/${booking.dispatch.ofpBriefing.id}`}>Open OFP</a>}
      {booking.cancellationReason && <p>Cancellation: {booking.cancellationReason}</p>}
      {booking.status === "CONFIRMED" && !booking.dispatch && <form action={createPilotDispatchAction}><input type="hidden" name="bookingId" value={booking.id}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><button className="button">Create Dispatch</button></form>}
      {booking.dispatch && <a className="button" href={`/pilot/dispatch/${booking.dispatch.id}`}>Open Dispatch</a>}
      {cancellable && <form action={cancelPilotBookingAction}><input type="hidden" name="bookingId" value={booking.id}/><label>Cancellation reason<input name="reason" required/></label><button className="button danger">Cancel booking</button></form>}
    </section>
  </PilotPortalShell>;
}
