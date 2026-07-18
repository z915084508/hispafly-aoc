import Link from "next/link";
import type { PilotBookingStatus } from "@prisma/client";
import { Badge } from "@/components/data-table";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { formatDate, localeTag } from "@/lib/i18n/core";
import { getLocale } from "@/lib/i18n/server";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const activeStatuses: PilotBookingStatus[] = ["PENDING", "CONFIRMED", "DISPATCH_PENDING", "DISPATCHED", "IN_PROGRESS", "BOOKED"];
const completedStatuses: PilotBookingStatus[] = ["COMPLETED", "FLOWN"];
const failedStatuses: PilotBookingStatus[] = ["CANCELLED", "EXPIRED", "FAILED", "REJECTED"];
const statusTone = (status: PilotBookingStatus) => completedStatuses.includes(status) ? "green" : failedStatuses.includes(status) ? "red" : "amber";

export default async function PilotBookingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [pilot, query, locale] = await Promise.all([requirePilotSession(), searchParams, getLocale()]);
  const selectedStatus = query.status && [...activeStatuses, ...completedStatuses, ...failedStatuses].includes(query.status as PilotBookingStatus) ? query.status as PilotBookingStatus : undefined;
  const bookings = await prisma.pilotBooking.findMany({
    where: { pilotId: pilot.id, ...(selectedStatus ? { status: selectedStatus } : {}) },
    include: { flight: true, fleet: true, aircraft: true, dispatch: { include: { ofpBriefing: true } }, matchedPirep: true },
    orderBy: { selectedDepartureAt: "desc" }, take: 150,
  });
  const current = bookings.filter((booking) => activeStatuses.includes(booking.status));
  const history = bookings.filter((booking) => !activeStatuses.includes(booking.status));
  const dateTime = (value: Date) => `${formatDate(value, locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
  const bookingCard = (booking: typeof bookings[number]) => {
    const progress = booking.matchedPirep ? 4 : booking.dispatch?.ofpBriefing ? 3 : booking.dispatch ? 2 : 1;
    return <article className="pilot-booking-card" key={booking.id}>
      <div className="pilot-booking-card-main"><div className="pilot-booking-identity"><span>{booking.flightNumber ?? booking.callsign ?? "Flight"}</span><strong>{booking.departureIcao} <b>→</b> {booking.arrivalIcao}</strong></div><div className="pilot-booking-badges"><Badge tone={statusTone(booking.status)}>{booking.status.replaceAll("_", " ")}</Badge><Badge tone={booking.dataOrigin === "VAMSYS_LEGACY" ? "gray" : "blue"}>{booking.dataOrigin === "VAMSYS_LEGACY" ? "HISTORY" : "AOC"}</Badge></div></div>
      <div className="pilot-booking-facts"><div><span>Departure</span><strong>{dateTime(booking.selectedDepartureAt)}</strong></div><div><span>Fleet / aircraft</span><strong>{booking.fleet?.code ?? booking.vamsysFleetId ?? "Fleet pending"} · {booking.aircraft?.registration ?? booking.aircraftRegistration ?? "Aircraft pending"}</strong></div><div><span>Dispatch</span><strong>{booking.dispatch?.status?.replaceAll("_", " ") ?? (booking.dataOrigin === "VAMSYS_LEGACY" ? "Historical record" : "Ready to prepare")}</strong></div></div>
      {booking.dataOrigin !== "VAMSYS_LEGACY" && <div className="booking-progress" aria-label={`Booking workflow step ${progress} of 4`}>{["Booked", "Dispatch", "OFP", "Completed"].map((step, index) => <div className={index < progress ? "done" : ""} key={step}><i>{index < progress ? "✓" : index + 1}</i><span>{step}</span></div>)}</div>}
      <div className="pilot-booking-card-footer"><span>{booking.dataOrigin === "VAMSYS_LEGACY" ? "Imported historical booking · no action required" : booking.dispatch?.ofpBriefing ? "OFP is ready for review" : booking.dispatch ? "Continue in Dispatch" : "Open booking to prepare Dispatch"}</span><Link className="action-button approve" href={`/pilot/bookings/${booking.id}`}>{booking.dataOrigin === "VAMSYS_LEGACY" ? "View record" : "Continue"}</Link></div>
    </article>;
  };
  return <PilotPortalShell>
    <div className="booking-page-header"><div><p className="eyebrow">MY OPERATIONS</p><h1>My bookings</h1><p className="page-copy">Manage current HispaFly flights and review imported history in one place.</p></div><Link className="button" href="/pilot/flight-offers">Book a flight</Link></div>
    <div className="booking-overview"><div><span>Action required</span><strong>{current.filter((booking) => !booking.dispatch).length}</strong><small>Bookings waiting for Dispatch</small></div><div><span>Active</span><strong>{current.length}</strong><small>Current AOC workflow</small></div><div><span>Completed</span><strong>{bookings.filter((booking) => completedStatuses.includes(booking.status)).length}</strong><small>Completed or flown</small></div><div><span>History</span><strong>{bookings.filter((booking) => booking.dataOrigin === "VAMSYS_LEGACY").length}</strong><small>Imported read-only records</small></div></div>
    <form className="booking-filter"><label>Status<select name="status" defaultValue={selectedStatus ?? ""}><option value="">All bookings</option><optgroup label="Current"><option>CONFIRMED</option><option>DISPATCH_PENDING</option><option>DISPATCHED</option><option>IN_PROGRESS</option></optgroup><optgroup label="History"><option>COMPLETED</option><option>FLOWN</option><option>CANCELLED</option><option>EXPIRED</option><option>FAILED</option></optgroup></select></label><button className="button secondary">Apply filter</button>{selectedStatus && <Link className="action-button" href="/pilot/bookings">Clear</Link>}</form>
    <section className="booking-section"><div className="booking-section-title"><div><span>01</span><div><h2>Current operations</h2><p>Bookings that can still move through Dispatch, OFP and ACARS.</p></div></div><b>{current.length}</b></div>{current.length ? <div className="pilot-booking-list">{current.map(bookingCard)}</div> : <div className="booking-empty"><strong>No active booking</strong><p>{selectedStatus ? "No booking matches this status." : "Choose an available flight to begin a new HispaFly operation."}</p><Link className="button" href="/pilot/flight-offers">Browse available flights</Link></div>}</section>
    <details className="booking-history" open={Boolean(selectedStatus && !activeStatuses.includes(selectedStatus))}><summary><span><b>02</b><strong>Booking history</strong><small>Completed, cancelled and imported vAMSYS records</small></span><em>{history.length}</em></summary>{history.length ? <div className="pilot-booking-list">{history.map(bookingCard)}</div> : <div className="empty-state">No historical bookings match this filter.</div>}</details>
    <p className="booking-timezone-note">Times are shown in UTC · Browser locale: {localeTag(locale)}</p>
  </PilotPortalShell>;
}
