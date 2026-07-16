import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

export default async function RoutesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPermission("ROUTE_VIEW", { entityType: "Route", attemptedAction: "view routes" });
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const search = query.search?.trim();
  const where = search ? { OR: [
    { flightNumber: { contains: search, mode: "insensitive" as const } },
    { departure: { contains: search.toUpperCase() } },
    { arrival: { contains: search.toUpperCase() } },
  ] } : {};
  const [routes, total] = await Promise.all([
    prisma.route.findMany({ where, include: { fleetAssignments: { include: { fleet: true } } }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * 25, take: 25 }),
    prisma.route.count({ where }),
  ]);
  return <>
    <div className="page-header"><div><div className="eyebrow">LOCAL LEGACY DATA</div><h1>Routes</h1><p>Stored routes are read-only until native route management is delivered in TASK 5.</p></div><button className="button" type="button" disabled>vAMSYS sync disabled</button></div>
    <div className="notice">External route synchronization and publication are frozen. Historical IDs remain available for migration audit.</div>
    <form className="filters"><input name="search" defaultValue={search} placeholder="Flight number or ICAO"/><button className="button secondary">Search</button></form>
    <div className="table-wrap"><table><thead><tr><th>Flight</th><th>Route</th><th>Fleets</th><th>Status</th><th>Origin</th><th>Legacy ID</th><th>Last sync</th></tr></thead><tbody>
      {routes.map((route) => <tr key={route.id}><td><Link href={`/staff/routes/${route.id}`}>{route.flightNumber ?? "—"}</Link></td><td>{route.departure} → {route.arrival}</td><td>{route.fleetAssignments.map((assignment) => assignment.fleet.name ?? assignment.vamsysFleetId).join(", ") || "—"}</td><td><span className="badge">{route.operationalStatus}</span></td><td><span className="badge">{route.dataOrigin}</span></td><td>{route.vamsysRouteId ?? "—"}</td><td>{route.lastSyncedAt?.toLocaleString() ?? "—"}</td></tr>)}
    </tbody></table></div>
    {!routes.length && <div className="empty-state">No local routes found.</div>}
    <div className="button-row">{page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}<span>{total ? (page - 1) * 25 + 1 : 0}–{Math.min(page * 25, total)} / {total}</span>{page * 25 < total && <Link href={`?page=${page + 1}`}>Next</Link>}</div>
  </>;
}
