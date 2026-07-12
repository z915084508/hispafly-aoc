import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { syncRoutesAction } from "./actions";

export default async function RoutesPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  await requireStaffPermission("ROUTE_VIEW", { entityType: "Route", attemptedAction: "view routes" });
  const q = await searchParams; const page = Math.max(1, Number(q.page) || 1); const search = q.search?.trim();
  const where = search ? { OR: [{ flightNumber: { contains: search, mode: "insensitive" as const } }, { departure: { contains: search.toUpperCase() } }, { arrival: { contains: search.toUpperCase() } }] } : {};
  const [routes,total] = await Promise.all([prisma.route.findMany({ where, include:{fleetAssignments:{include:{fleet:true}}}, orderBy:{updatedAt:"desc"}, skip:(page-1)*25, take:25 }),prisma.route.count({where})]);
  return <><div className="page-header"><div><div className="eyebrow">VAMSYS ROUTES</div><h1>Routes</h1><p>Synchronize and publish official vAMSYS routes.</p></div><div className="button-row"><form action={syncRoutesAction}><button className="button secondary">Synchronize routes</button></form><Link className="button" href="/staff/routes/new">Create route</Link></div></div>
  {q.success&&<div className="notice success">{q.success}</div>}{q.error&&<div className="notice error">{q.error}</div>}
  <form className="filters"><input name="search" defaultValue={search} placeholder="Flight number or ICAO"/><button className="button secondary">Search</button></form>
  <div className="table-wrap"><table><thead><tr><th>Flight</th><th>Route</th><th>Fleets</th><th>Status</th><th>Sync</th><th>vAMSYS ID</th><th>Last sync</th></tr></thead><tbody>{routes.map(r=><tr key={r.id}><td><Link href={`/staff/routes/${r.id}`}>{r.flightNumber??"—"}</Link></td><td>{r.departure}–{r.arrival}</td><td>{r.fleetAssignments.map(x=>x.fleet.name??x.vamsysFleetId).join(", ")||"—"}</td><td><span className="badge">{r.operationalStatus}</span></td><td><span className="badge">{r.syncStatus}</span></td><td>{r.vamsysRouteId??"—"}</td><td>{r.lastSyncedAt?.toLocaleString()??"—"}</td></tr>)}</tbody></table></div>
  {!routes.length&&<div className="empty-state">No routes found.</div>}<div className="button-row">{page>1&&<Link href={`?page=${page-1}`}>Previous</Link>}<span>{(page-1)*25+1}–{Math.min(page*25,total)} / {total}</span>{page*25<total&&<Link href={`?page=${page+1}`}>Next</Link>}</div></>;
}
