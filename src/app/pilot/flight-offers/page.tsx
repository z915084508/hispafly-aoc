import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { listBookableFlights } from "@/lib/native-flight/booking";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function PilotFlightOffersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const pilot = await requirePilotSession();
  const query = await searchParams;
  const [result, airports, fleets] = await Promise.all([
    listBookableFlights({
      pilotId: pilot.id,
      from: query.from ? new Date(`${query.from}T00:00:00Z`) : undefined,
      to: query.to ? new Date(`${query.to}T23:59:59Z`) : undefined,
      departureAirportId: query.departureAirportId,
      arrivalAirportId: query.arrivalAirportId,
      flightNumber: query.flightNumber,
      fleetId: query.fleetId,
      page: Number(query.page) || 1,
    }),
    prisma.airport.findMany({ where: { status: "ACTIVE" }, orderBy: { icao: "asc" } }),
    prisma.fleet.findMany({ where: { operationalStatus: "ACTIVE" }, orderBy: { code: "asc" } }),
  ]);
  return <PilotPortalShell>
    <PageHeading eyebrow="HISPAFLY NATIVE" title="Available flights" copy="Search and book concrete HispaFly flights without any external booking system." />
    <form className="audit-filters"><label>From<input type="date" name="from" defaultValue={query.from}/></label><label>To<input type="date" name="to" defaultValue={query.to}/></label><label>Departure<select name="departureAirportId" defaultValue={query.departureAirportId ?? ""}><option value="">All</option>{airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.icao}</option>)}</select></label><label>Arrival<select name="arrivalAirportId" defaultValue={query.arrivalAirportId ?? ""}><option value="">All</option>{airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.icao}</option>)}</select></label><label>Flight<input name="flightNumber" defaultValue={query.flightNumber}/></label><label>Fleet<select name="fleetId" defaultValue={query.fleetId ?? ""}><option value="">All</option>{fleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.code ?? fleet.name}</option>)}</select></label><button className="button secondary">Search</button></form>
    <section className="card"><div className="table-wrap"><table><thead><tr><th>Flight</th><th>Route</th><th>Operating date</th><th>Local schedule</th><th>Duration</th><th>Fleet / Aircraft</th><th>Window</th><th></th></tr></thead><tbody>{result.rows.map((flight) => <tr key={flight.id}><td><strong>{flight.flightNumber}</strong><br/>{flight.callsign}</td><td>{flight.departureIcao} → {flight.arrivalIcao}</td><td>{flight.operatingDate.toISOString().slice(0, 10)}</td><td>{flight.departureLocalTime} {flight.departureTimezone}<br/>{flight.arrivalLocalTime} {flight.arrivalTimezone}</td><td>{flight.scheduledDurationMinutes} min</td><td>{flight.fleet?.code ?? "Fleet pending"}<br/>{flight.assignedAircraft?.registration ?? "Aircraft pending assignment"}</td><td>{flight.bookingCloseAt ? `Closes ${flight.bookingCloseAt.toISOString()}` : "Open until departure"}</td><td><Link className="action-button approve" href={`/pilot/flight-offers/${flight.id}`}>Review & book</Link></td></tr>)}</tbody></table></div>{!result.rows.length && <div className="empty-state">No currently bookable flights match these filters.</div>}</section>
  </PilotPortalShell>;
}
