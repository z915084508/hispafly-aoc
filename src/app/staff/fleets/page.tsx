import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

export default async function FleetsPage() {
  await requireStaffPermission("FLEET_VIEW", { entityType: "Fleet", attemptedAction: "view fleets" });
  const fleets = await prisma.fleet.findMany({
    include: { _count: { select: { routeAssignments: true } } },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });
  return <>
    <div className="page-header"><div><div className="eyebrow">LOCAL LEGACY DATA</div><h1>Fleet management</h1><p>Stored fleet records remain read-only until TASK 5 provides native fleet management.</p></div><button className="button" type="button" disabled>vAMSYS sync disabled</button></div>
    <div className="notice">No synchronize, publish, edit or delete request will be sent to vAMSYS.</div>
    <div className="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Passengers</th><th>Cargo</th><th>Routes</th><th>Origin</th><th>Legacy ID</th></tr></thead><tbody>
      {fleets.map((fleet) => <tr key={fleet.id}><td><Link href={`/staff/fleets/${fleet.id}`}><strong>{fleet.code ?? "—"}</strong></Link></td><td>{fleet.name ?? "—"}</td><td>{fleet.type ?? "—"}</td><td>{fleet.maxPassengers ?? "—"}</td><td>{fleet.maxCargoKg === null ? "—" : `${fleet.maxCargoKg} kg`}</td><td>{fleet._count.routeAssignments}</td><td><span className="badge">{fleet.dataOrigin}</span></td><td>{fleet.vamsysFleetId ?? "—"}</td></tr>)}
    </tbody></table></div>
    {!fleets.length && <div className="empty-state">No local fleet records.</div>}
  </>;
}
