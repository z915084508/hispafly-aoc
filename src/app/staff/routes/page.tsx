import Link from "next/link";
import type { RouteOperationalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listRoutes } from "@/lib/native-flight/route";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

const qs = (query: Record<string, string | undefined>, page: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), page: String(page) }).toString()}`;
export default async function RoutesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams, staff = await getCurrentStaff();
  const [result, airports, fleets] = await Promise.all([
    listRoutes({ search: query.search, status: query.status as RouteOperationalStatus | undefined, dataOrigin: query.source, departureAirportId: query.departureAirportId, arrivalAirportId: query.arrivalAirportId, fleetId: query.fleetId, page: Number(query.page) || 1 }),
    prisma.airport.findMany({ orderBy: { icao: "asc" }, select: { id: true, icao: true } }),
    prisma.fleet.findMany({ orderBy: [{ code: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true } }),
  ]);
  return <>
    <div className="page-header"><div><div className="eyebrow">NETWORK PLANNING</div><h1>Routes</h1><p>Native routes use internal Airport and Fleet identities. Legacy records remain read-only.</p></div>{staffHasPermission(staff, "ROUTE_CREATE") && <Link className="button" href="/staff/routes/new">New route</Link>}</div>
    {query.error && <div className="notice">{query.error}</div>}
    <form className="audit-filters"><label>Search<input name="search" defaultValue={query.search} placeholder="Route code, flight or ICAO"/></label><label>Status<select name="status" defaultValue={query.status ?? ""}><option value="">All</option><option>DRAFT</option><option>ACTIVE</option><option>SUSPENDED</option><option>ARCHIVED</option></select></label><label>Source<select name="source" defaultValue={query.source ?? ""}><option value="">All</option><option>HISPAFLY_NATIVE</option><option>IMPORTED</option><option>MANUAL</option><option>VAMSYS_LEGACY</option></select></label><label>Departure<select name="departureAirportId" defaultValue={query.departureAirportId ?? ""}><option value="">All</option>{airports.map((a) => <option key={a.id} value={a.id}>{a.icao}</option>)}</select></label><label>Arrival<select name="arrivalAirportId" defaultValue={query.arrivalAirportId ?? ""}><option value="">All</option>{airports.map((a) => <option key={a.id} value={a.id}>{a.icao}</option>)}</select></label><label>Fleet<select name="fleetId" defaultValue={query.fleetId ?? ""}><option value="">All</option>{fleets.map((f) => <option key={f.id} value={f.id}>{f.code ?? f.name ?? f.id}</option>)}</select></label><button className="button secondary">Filter</button></form>
    <div className="table-wrap"><table><thead><tr><th>Route / Flight</th><th>Airports</th><th>Default fleet</th><th>Duration</th><th>Status</th><th>Source</th><th>Effective period</th></tr></thead><tbody>{result.rows.map((route) => <tr key={route.id}><td><Link href={`/staff/routes/${route.id}`}><strong>{route.routeCode ?? "—"}</strong><br/>{route.flightNumber ?? "—"}</Link></td><td>{route.departureAirport?.icao ?? route.departure} → {route.arrivalAirport?.icao ?? route.arrival}</td><td>{route.defaultFleet?.code ?? route.defaultFleet?.name ?? "—"}</td><td>{route.scheduledDurationMinutes ? `${route.scheduledDurationMinutes} min` : "—"}</td><td><span className="badge">{route.operationalStatus}</span></td><td><span className="badge">{route.dataOrigin}</span>{route.vamsysRouteId && <><br/><small>Legacy</small></>}</td><td>{route.effectiveFrom?.toLocaleDateString() ?? "Open"} → {route.effectiveUntil?.toLocaleDateString() ?? "Open"}</td></tr>)}</tbody></table></div>
    {!result.rows.length && <div className="empty-state">No routes match these filters.</div>}
    <div className="button-row"><span>{result.total} routes</span>{result.page > 1 && <Link href={qs(query, result.page - 1)}>Previous</Link>}{result.page * result.pageSize < result.total && <Link href={qs(query, result.page + 1)}>Next</Link>}</div>
  </>;
}
