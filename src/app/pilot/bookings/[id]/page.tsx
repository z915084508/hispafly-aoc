import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { checkPilotEligibility } from "@/lib/native-flight/booking";
import { cancelPilotBookingAction } from "../actions";
import { createPilotDispatchAction } from "../../dispatch/actions";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { formatDate } from "@/lib/i18n/core";
import { getLocale } from "@/lib/i18n/server";

export default async function PilotBookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ id }, query, pilot, locale] = await Promise.all([params, searchParams, requirePilotSession(), getLocale()]);
  const booking = await prisma.pilotBooking.findFirst({ where: { id, pilotId: pilot.id }, include: { flight: true, route: true, fleet: true, aircraft: { include: { currentAirport: true } }, dispatch: { include: { ofpBriefing: true } }, matchedPirep: true } });
  if (!booking) notFound();
  const eligibility = booking.flight ? await checkPilotEligibility(pilot.id, booking.flight) : null;
  const cancellable = booking.dataOrigin !== "VAMSYS_LEGACY" && ["PENDING","CONFIRMED","BOOKED"].includes(booking.status) && !booking.dispatch;
  const dateTime = (value: Date | null) => value ? `${formatDate(value, locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : "—";
  const progress = booking.matchedPirep ? 4 : booking.dispatch?.ofpBriefing ? 3 : booking.dispatch ? 2 : 1;
  return <PilotPortalShell><div className="booking-detail-back"><Link href="/pilot/bookings">← My bookings</Link></div><PageHeading eyebrow={booking.dataOrigin === "VAMSYS_LEGACY" ? "HISTORICAL RECORD" : "HISPAFLY AOC BOOKING"} title={`${booking.flightNumber ?? "Flight"} · ${booking.departureIcao} → ${booking.arrivalIcao}`} copy={booking.dataOrigin === "VAMSYS_LEGACY" ? "Imported read-only record. No operational action is required." : `Current status: ${booking.status.replaceAll("_", " ")}`}/>
    {query.error && <div className="feedback error">{query.error}</div>}{query.success && <div className="feedback success">{query.success}</div>}
    {booking.dataOrigin !== "VAMSYS_LEGACY" && <section className="card booking-detail-workflow"><h2>Operation progress</h2><div className="booking-progress">{["Booked", "Dispatch", "OFP", "Completed"].map((step, index) => <div className={index < progress ? "done" : ""} key={step}><i>{index < progress ? "✓" : index + 1}</i><span>{step}</span></div>)}</div><p>{!booking.dispatch ? "Create Dispatch when you are ready to begin operational preparation." : !booking.dispatch.ofpBriefing ? "Dispatch created. Continue to complete release and OFP preparation." : !booking.matchedPirep ? "OFP available. Complete the flight in ACARS to close this operation." : "Operation completed and matched to a PIREP."}</p></section>}
    <section className="card booking-detail-card"><div className="workflow-summary"><div><span>Departure</span><strong>{dateTime(booking.selectedDepartureAt)}</strong></div><div><span>Estimated arrival</span><strong>{dateTime(booking.estimatedArrivalAt)}</strong></div><div><span>Fleet</span><strong>{booking.fleet?.code ?? booking.vamsysFleetId ?? "—"}</strong></div><div><span>Aircraft</span><strong>{booking.aircraft?.registration ?? booking.aircraftRegistration ?? "Pending assignment"}</strong></div><div><span>Dispatch</span><strong>{booking.dispatch?.status?.replaceAll("_", " ") ?? (booking.dataOrigin === "VAMSYS_LEGACY" ? "Historical record" : "Not prepared")}</strong></div><div><span>{booking.dataOrigin === "VAMSYS_LEGACY" ? "Legacy reference" : "Booking source"}</span><strong>{booking.legacyReference ?? booking.vamsysBookingId ?? booking.dataOrigin}</strong></div></div>
      {eligibility?.warnings.map((warning) => <div className="notice" key={warning}>{warning}</div>)}
      <div className="booking-detail-actions">{booking.dispatch?.ofpBriefing && <a className="button" href={`/pilot/ofp/${booking.dispatch.ofpBriefing.id}`}>Open OFP</a>}
      {booking.cancellationReason && <p>Cancellation: {booking.cancellationReason}</p>}
      {booking.status === "CONFIRMED" && !booking.dispatch && <form action={createPilotDispatchAction}><input type="hidden" name="bookingId" value={booking.id}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><button className="button">Create Dispatch</button></form>}
      {booking.dispatch && <a className="button secondary" href={`/pilot/dispatch/${booking.dispatch.id}`}>Open Dispatch</a>}</div>
      {cancellable && <form action={cancelPilotBookingAction}><input type="hidden" name="bookingId" value={booking.id}/><label>Cancellation reason<input name="reason" required/></label><button className="button danger">Cancel booking</button></form>}
    </section>
  </PilotPortalShell>;
}
