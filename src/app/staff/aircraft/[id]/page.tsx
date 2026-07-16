import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

export default async function AircraftDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaffPermission("AIRCRAFT_VIEW", { entityType: "Aircraft", entityId: id, attemptedAction: "view aircraft" });
  const aircraft = await prisma.aircraft.findUnique({ where: { id } });
  if (!aircraft) notFound();
  return <>
    <div className="page-header"><div><div className="eyebrow">{aircraft.dataOrigin}</div><h1>{aircraft.registration ?? aircraft.name}</h1><p>Legacy vAMSYS ID: {aircraft.vamsysAircraftId}</p></div><button className="button" type="button" disabled>Read-only legacy record</button></div>
    <div className="notice">Editing and permanent deletion are disabled to protect historical data.</div>
    <div className="detail-grid"><section className="card"><h2>Identity</h2><p>Fleet: {aircraft.fleetName ?? "—"}</p><p>Registration: {aircraft.registration ?? "—"}</p><p>Type: {aircraft.aircraftType ?? "—"}</p><p>SELCAL: {aircraft.selcal ?? "—"}</p><p>FIN: {aircraft.finNumber ?? "—"}</p></section><section className="card"><h2>Local operations</h2><p>Status: {aircraft.status ?? "—"}</p><p>Passengers: {aircraft.seatCapacity ?? "Fleet default"}</p><p>Cargo: {aircraft.cargoCapacityKg === null ? "Fleet default" : `${aircraft.cargoCapacityKg} kg`}</p></section><section className="card"><h2>Legacy sync audit</h2><p>Status: {aircraft.syncStatus}</p><p>Last synchronized: {aircraft.lastSyncedAt?.toLocaleString() ?? "—"}</p><p>Source updated: {aircraft.sourceUpdatedAt?.toLocaleString() ?? "—"}</p><p>{aircraft.lastSyncError}</p></section><section className="card"><h2>Notes</h2><p>{aircraft.internalNotes ?? aircraft.vamsysInternalRemarks ?? "—"}</p></section></div>
  </>;
}
