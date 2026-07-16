import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import { assignAircraftAction, cancelFlightAction } from "../actions";
export default async function FlightDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ id }, query, staff] = await Promise.all([params, searchParams, getCurrentStaff()]);
  const [flight, aircraft] = await Promise.all([prisma.flight.findUnique({ where: { id }, include: { offers: true, bookings: true, dispatches: true } }), prisma.aircraft.findMany({ where: { operationalStatus: { in: ["AVAILABLE", "FERRY_ONLY"] } }, orderBy: { registration: "asc" } })]);
  if (!flight) notFound();
  return <><div className="page-header"><div><div className="eyebrow">NATIVE FLIGHT</div><h1>{flight.flightNumber}: {flight.departureIcao} → {flight.arrivalIcao}</h1><p>{flight.operatingDate.toISOString().slice(0, 10)} · {flight.status} · {flight.operatingType}</p></div></div>{query.error && <div className="notice">{query.error}</div>}{query.success && <div className="notice success">{query.success}</div>}<div className="detail-grid"><section><h2>Schedule snapshot</h2><p>STD {flight.scheduledDeparture.toISOString()}<br/>STA {flight.scheduledArrival.toISOString()}<br/>{flight.departureLocalTime} {flight.departureTimezone} → {flight.arrivalLocalTime} {flight.arrivalTimezone}</p></section><section><h2>Operational links</h2><p>{flight.offers.length} offers<br/>{flight.bookings.length} bookings<br/>{flight.dispatches.length} dispatches</p></section></div>
    {staffHasPermission(staff, "FLIGHT_ASSIGN") && !flight.assignedAircraftId && <form action={assignAircraftAction} className="form-grid"><input type="hidden" name="flightId" value={flight.id}/><label>Assign aircraft<select name="aircraftId" required>{aircraft.map((item) => <option key={item.id} value={item.id}>{item.registration}</option>)}</select></label><button className="button">Validate and assign</button></form>}
    {staffHasPermission(staff, "FLIGHT_CANCEL") && flight.status !== "COMPLETED" && flight.status !== "CANCELLED" && <form action={cancelFlightAction} className="form-grid"><input type="hidden" name="flightId" value={flight.id}/><label>Cancellation reason<input name="reason" required/></label><button className="button danger">Cancel flight</button></form>}
  </>;
}
