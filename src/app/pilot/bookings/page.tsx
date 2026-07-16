import Link from "next/link";
import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function PilotBookingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [pilot, query] = await Promise.all([requirePilotSession(), searchParams]);
  const bookings = await prisma.pilotBooking.findMany({
    where: { pilotId: pilot.id, ...(query.status ? { status: query.status as never } : {}) },
    include: { flight: true, fleet: true, aircraft: true, dispatch: true },
    orderBy: { selectedDepartureAt: "desc" },
    take: 150,
  });
  return <PilotPortalShell><PageHeading eyebrow="MY OPERATIONS" title="My bookings" copy="Native and historical bookings. Legacy records are read-only."/>
    <form className="audit-filters"><label>Status<select name="status" defaultValue={query.status ?? ""}><option value="">All</option><option>CONFIRMED</option><option>DISPATCH_PENDING</option><option>DISPATCHED</option><option>IN_PROGRESS</option><option>COMPLETED</option><option>CANCELLED</option><option>EXPIRED</option></select></label><button className="button secondary">Filter</button></form>
    {bookings.length ? <DataTable headers={["Flight","Route","Departure","Fleet / Aircraft","Status","Source","Dispatch",""]} rows={bookings.map((booking) => [
      booking.flightNumber ?? booking.callsign ?? "—",
      `${booking.departureIcao} → ${booking.arrivalIcao}`,
      booking.selectedDepartureAt.toISOString(),
      `${booking.fleet?.code ?? booking.vamsysFleetId ?? "—"} / ${booking.aircraft?.registration ?? booking.aircraftRegistration ?? "Pending"}`,
      <Badge key="status" tone={["COMPLETED","FLOWN"].includes(booking.status) ? "green" : ["CANCELLED","EXPIRED","FAILED","REJECTED"].includes(booking.status) ? "red" : "amber"}>{booking.status}</Badge>,
      booking.dataOrigin,
      booking.dispatch?.status ?? "Not started",
      <Link key="detail" className="action-button" href={`/pilot/bookings/${booking.id}`}>Details</Link>,
    ])}/> : <div className="empty-state">No bookings match this filter.</div>}
  </PilotPortalShell>;
}
