import Link from "next/link";
import type { AirportStatus } from "@prisma/client";
import { listAirports } from "@/lib/native-flight/airport";
import { staffHasPermission } from "@/lib/staff/permissions";
import { getCurrentStaff } from "@/lib/staff/currentStaff";

const qs = (query: Record<string, string | undefined>, page: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), page: String(page) }).toString()}`;
export default async function AirportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams, staff = await getCurrentStaff();
  const result = await listAirports({
    search: query.search, country: query.country, status: query.status as AirportStatus | undefined,
    dataOrigin: query.source, page: Number(query.page) || 1,
  });
  return <>
    <div className="page-header"><div><div className="eyebrow">NETWORK PLANNING</div><h1>Airports</h1><p>HispaFly Native airport identities used by routes, schedules and aircraft.</p></div>{staffHasPermission(staff, "AIRPORT_CREATE") && <Link className="button" href="/staff/airports/new">New airport</Link>}</div>
    {query.error && <div className="notice">{query.error}</div>}
    <form className="audit-filters"><label>Search<input name="search" defaultValue={query.search} placeholder="ICAO, IATA, name or city"/></label><label>Country<input name="country" defaultValue={query.country}/></label><label>Status<select name="status" defaultValue={query.status ?? ""}><option value="">All</option><option>ACTIVE</option><option>INACTIVE</option><option>ARCHIVED</option></select></label><label>Source<select name="source" defaultValue={query.source ?? ""}><option value="">All</option><option>HISPAFLY_NATIVE</option><option>IMPORTED</option><option>MANUAL</option><option>VAMSYS_LEGACY</option></select></label><button className="button secondary">Filter</button></form>
    <div className="table-wrap"><table><thead><tr><th>Airport</th><th>Name</th><th>Location</th><th>Timezone</th><th>Status</th><th>Source</th><th>Routes out / in</th></tr></thead><tbody>{result.rows.map((airport) => <tr key={airport.id}><td><Link href={`/staff/airports/${airport.id}`}><strong>{airport.icao}</strong>{airport.iata ? ` / ${airport.iata}` : ""}</Link></td><td>{airport.name ?? "—"}</td><td>{[airport.city, airport.country].filter(Boolean).join(", ") || "—"}</td><td>{airport.timezone ?? "—"}</td><td><span className="badge">{airport.status}</span></td><td><span className="badge">{airport.dataOrigin}</span></td><td>{airport._count.departureRoutes} / {airport._count.arrivalRoutes}</td></tr>)}</tbody></table></div>
    {!result.rows.length && <div className="empty-state">No airports match these filters.</div>}
    <div className="button-row"><span>{result.total} airports</span>{result.page > 1 && <Link href={qs(query, result.page - 1)}>Previous</Link>}{result.page * result.pageSize < result.total && <Link href={qs(query, result.page + 1)}>Next</Link>}</div>
  </>;
}
