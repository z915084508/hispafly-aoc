import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

export default async function FleetDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaffPermission("FLEET_VIEW", { entityType: "Fleet", entityId: id, attemptedAction: "view fleet" });
  const fleet = await prisma.fleet.findUnique({ where: { id }, include: { routeAssignments: { include: { route: true } } } });
  if (!fleet) notFound();
  const aircraft = await prisma.aircraft.count({ where: { fleetId: fleet.vamsysFleetId ?? "__none__" } });
  return <>
    <div className="page-header"><div><div className="eyebrow">{fleet.dataOrigin}</div><h1>{fleet.name ?? fleet.code ?? "Fleet"}</h1><p>Legacy vAMSYS ID: {fleet.vamsysFleetId ?? "—"}</p></div><button className="button" type="button" disabled>Read-only legacy record</button></div>
    <div className="notice">Editing, publishing and permanent deletion are disabled to protect historical data.</div>
    <div className="detail-grid"><section className="card"><h2>Configuration</h2><p>Code: {fleet.code ?? "—"}</p><p>Type: {fleet.type ?? "—"}</p><p>Passengers: {fleet.maxPassengers ?? "—"}</p><p>Cargo: {fleet.maxCargoKg ?? "—"} kg</p></section><section className="card"><h2>Usage</h2><p>Route assignments: {fleet.routeAssignments.length}</p><p>Aircraft: {aircraft}</p></section><section className="card"><h2>Legacy sync audit</h2><p>Status: {fleet.syncStatus}</p><p>Last synchronized: {fleet.lastSyncedAt?.toLocaleString() ?? "—"}</p><p>Source updated: {fleet.sourceUpdatedAt?.toLocaleString() ?? "—"}</p><p>{fleet.lastSyncError}</p></section><section className="card"><h2>Internal notes</h2><p>{fleet.internalNotes ?? "—"}</p></section></div>
  </>;
}
