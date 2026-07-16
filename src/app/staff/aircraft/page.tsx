import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

export default async function AircraftPage() {
  await requireStaffPermission("AIRCRAFT_VIEW", { entityType: "Aircraft", attemptedAction: "view aircraft" });
  const rows = await prisma.aircraft.findMany({ orderBy: [{ fleetName: "asc" }, { registration: "asc" }] });
  const visible = rows.filter((aircraft) => !aircraft.hiddenInPhoenix).length;
  return <>
    <div className="page-header"><div><div className="eyebrow">LOCAL LEGACY DATA</div><h1>Aircraft management</h1><p>Local aircraft records remain readable while TASK 5 replaces the external fleet authority.</p></div><button className="button" type="button" disabled>vAMSYS sync disabled</button></div>
    <div className="notice">External create, update, delete and synchronize operations are frozen.</div>
    <div className="metric-grid"><div className="metric card"><span>Total aircraft</span><strong>{rows.length}</strong></div><div className="metric card"><span>Locally visible</span><strong>{visible}</strong></div><div className="metric card"><span>Unavailable</span><strong>{rows.length - visible}</strong></div></div>
    <div className="table-wrap"><table><thead><tr><th>Registration</th><th>Name</th><th>Fleet</th><th>Capacity</th><th>SELCAL</th><th>Origin</th><th>Legacy ID</th></tr></thead><tbody>
      {rows.map((aircraft) => <tr key={aircraft.id}><td><Link href={`/staff/aircraft/${aircraft.id}`}><strong>{aircraft.registration ?? "—"}</strong></Link></td><td>{aircraft.name ?? aircraft.aircraftType ?? "—"}</td><td>{aircraft.fleetName ?? "—"}</td><td>{aircraft.seatCapacity ?? "Fleet default"}</td><td>{aircraft.selcal ?? "—"}</td><td><span className="badge">{aircraft.dataOrigin}</span></td><td>{aircraft.vamsysAircraftId}</td></tr>)}
    </tbody></table></div>
    {!rows.length && <div className="empty-state">No local aircraft records.</div>}
  </>;
}
