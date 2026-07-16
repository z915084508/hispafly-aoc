import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

export default async function RouteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaffPermission("ROUTE_VIEW", { entityType: "Route", entityId: id, attemptedAction: "view route" });
  const route = await prisma.route.findUnique({ where: { id }, include: { fleetAssignments: { include: { fleet: true } } } });
  if (!route) notFound();
  return <>
    <div className="page-header"><div><div className="eyebrow">{route.dataOrigin}</div><h1>{route.flightNumber ?? route.callsign ?? "Route"}</h1><p>{route.departure} → {route.arrival} · Legacy ID {route.vamsysRouteId ?? "—"}</p></div><button className="button" type="button" disabled>Read-only legacy record</button></div>
    <div className="notice">Editing and publication are disabled until TASK 5 introduces HispaFly-native routes.</div>
    <div className="detail-grid"><section className="card"><h2>General</h2><p>Callsign: {route.callsign ?? "—"}</p><p>Status: {route.operationalStatus}</p><p>Fleets: {route.fleetAssignments.map((item) => item.fleet.name ?? item.vamsysFleetId).join(", ") || "—"}</p></section><section className="card"><h2>Operations</h2><p>Route: {route.route ?? "—"}</p><p>Duration: {route.scheduledDurationMinutes ?? "—"} min</p><p>Distance: {route.distanceNm ?? "—"} NM</p><p>Altitude: {route.cruiseAltitude ?? "—"} ft</p></section><section className="card"><h2>Legacy sync audit</h2><p>Published: {route.lastPublishedAt?.toLocaleString() ?? "—"}</p><p>Synchronized: {route.lastSyncedAt?.toLocaleString() ?? "—"}</p><p>Source updated: {route.sourceUpdatedAt?.toLocaleString() ?? "—"}</p><p>{route.lastSyncError}</p></section><section className="card"><h2>Internal notes</h2><p>{route.internalNotes ?? "—"}</p></section></div>
    <details><summary>Retained raw source JSON</summary><pre>{JSON.stringify(route.rawData, null, 2)}</pre></details>
  </>;
}
