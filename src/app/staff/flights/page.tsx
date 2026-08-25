import Link from "next/link";
import { NativeFlightStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

const activeStatuses = ["PENDING", "CONFIRMED", "BOOKED", "DISPATCH_PENDING", "DISPATCHED", "IN_PROGRESS"] as const;

export default async function FlightsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const [staff, flights] = await Promise.all([getCurrentStaff(), prisma.flight.findMany({
    where: {
      ...(query.status && Object.values(NativeFlightStatus).includes(query.status as NativeFlightStatus) ? { status: query.status as NativeFlightStatus } : {}),
      ...(query.date ? { operatingDate: new Date(`${query.date}T00:00:00.000Z`) } : {}),
    },
    include: { fleet: true, assignedAircraft: true, bookings: { where: { status: { in: [...activeStatuses] } }, include: { pilot: { select: { callsign: true, displayName: true } } }, take: 1 }, _count: { select: { offers: true, bookings: true, dispatches: true } } },
    orderBy: { scheduledDeparture: "asc" }, take: 250,
  })]);
  return <>
    <div className="page-header"><div><div className="eyebrow">NATIVE OPERATIONS</div><h1>Flights</h1><p>Concrete PROGRAMACIÓN flight instances and their pilot reservation status.</p></div><div className="button-row"><Link className="button secondary" href="/staff/amn-sync">Sync AMN</Link><Link className="button secondary" href="/staff/schedules">Manage schedules</Link>{staffHasPermission(staff, "FLIGHT_CREATE") && <Link className="button" href="/staff/flights/new">Manual flight</Link>}</div></div>
    <form className="audit-filters"><label>Operating date<input name="date" type="date" defaultValue={query.date}/></label><label>Status<select name="status" defaultValue={query.status ?? ""}><option value="">All</option>{Object.values(NativeFlightStatus).map((status) => <option key={status}>{status}</option>)}</select></label><button className="button secondary">Filter</button></form>
    <div className="table-wrap"><table><thead><tr><th>Flight</th><th>Route</th><th>Date</th><th>STD / STA UTC</th><th>Fleet / Aircraft</th><th>Status</th><th>Reservation</th><th>Links</th></tr></thead><tbody>
      {flights.map((flight) => { const reservation=flight.bookings[0]; return <tr key={flight.id}><td><Link href={`/staff/flights/${flight.id}`}><strong>{flight.flightNumber}</strong></Link><br/>{flight.callsign}</td><td>{flight.departureIcao} → {flight.arrivalIcao}</td><td>{flight.operatingDate.toISOString().slice(0,10)}</td><td>{flight.scheduledDeparture.toISOString().slice(0,16).replace("T"," ")}<br/>{flight.scheduledArrival.toISOString().slice(0,16).replace("T"," ")}</td><td>{flight.fleet?.code ?? "Any"} / {flight.assignedAircraft?.registration ?? "Unassigned"}</td><td><span className="badge">{reservation ? "RESERVED" : flight.status}</span></td><td>{reservation ? <><strong>{reservation.pilot.callsign ?? reservation.pilot.displayName}</strong><br/>{reservation.pilot.displayName}</> : "Available"}</td><td>{flight._count.offers} offers · {flight._count.bookings} bookings · {flight._count.dispatches} dispatches</td></tr>; })}
    </tbody></table></div>{!flights.length && <div className="empty-state">No flights match the selected filters.</div>}
  </>;
}
