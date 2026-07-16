import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findRouteById } from "@/lib/native-flight/route";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import { changeRouteStatusAction, copyRouteAction } from "../actions";

export default async function RouteDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params, query = await searchParams;
  const [route, staff, audit] = await Promise.all([
    findRouteById(id), getCurrentStaff(),
    prisma.aocAuditLog.findMany({ where: { OR: [{ entityType: "Route", entityId: id }, { metadata: { path: ["sourceRouteId"], equals: id } }] }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  if (!route) notFound();
  const native = route.dataOrigin !== "VAMSYS_LEGACY";
  return <>
    <div className="page-header"><div><div className="eyebrow">{route.dataOrigin}</div><h1>{route.routeCode ?? route.flightNumber ?? "Route"}</h1><p>{route.departureAirport?.icao ?? route.departure} → {route.arrivalAirport?.icao ?? route.arrival} · {route.operationalStatus}</p></div><div className="button-row"><Link href="/staff/routes">All routes</Link>{native && route.operationalStatus !== "ARCHIVED" && staffHasPermission(staff, "ROUTE_EDIT") && <Link className="button" href={`/staff/routes/${id}/edit`}>Edit route</Link>}</div></div>
    {query.error && <div className="notice">{query.error}</div>}{query.success && <div className="notice">{query.success}</div>}
    {!native && <div className="notice">Legacy route: historical read-only data. No vAMSYS request, synchronization or publication is available.</div>}
    <div className="detail-grid">
      <section className="card"><h2>Identity</h2><p>Flight number: {route.flightNumber ?? "—"}</p><p>Callsign: {route.callsign ?? "—"}</p><p>Legacy reference: {route.vamsysRouteId ?? "—"}</p><p>Source: {route.dataOrigin}</p></section>
      <section className="card"><h2>Operations</h2><p>Default fleet: {route.defaultFleet?.code ?? route.defaultFleet?.name ?? "—"}</p><p>Duration: {route.scheduledDurationMinutes ? `${route.scheduledDurationMinutes} min` : "—"}</p><p>Altitude: {route.cruiseAltitude ? `${route.cruiseAltitude} ft` : "—"}</p><p>Route: {route.route ?? "—"}</p><p>Network policy: {route.networkPolicy ?? "—"}</p></section>
      <section className="card"><h2>Lifecycle</h2><p>Status: {route.operationalStatus}</p><p>Effective: {route.effectiveFrom?.toLocaleDateString() ?? "Open"} → {route.effectiveUntil?.toLocaleDateString() ?? "Open"}</p><p>Schedules: {route._count.schedules}</p><p>Flights: {route._count.flights}</p></section>
      <section className="card"><h2>Operational notes</h2><p>{route.internalNotes ?? "—"}</p></section>
    </div>
    {native && (staffHasPermission(staff, "ROUTE_EDIT") || staffHasPermission(staff, "ROUTE_ARCHIVE")) && <section className="card danger-zone"><h2>Route lifecycle</h2><p>DRAFT is editable, ACTIVE may be consumed by TASK 5.4, SUSPENDED blocks new schedules, and ARCHIVED is permanently read-only.</p><form action={changeRouteStatusAction} className="inline-form"><input type="hidden" name="id" value={id}/><label>New status<select name="status" defaultValue={route.operationalStatus}><option>DRAFT</option><option>ACTIVE</option><option>SUSPENDED</option>{staffHasPermission(staff, "ROUTE_ARCHIVE") && <option>ARCHIVED</option>}</select></label><label>Reason<input name="reason" required/></label><button className="button danger">Confirm status change</button></form></section>}
    {!native && staffHasPermission(staff, "ROUTE_CREATE") && <section className="card"><h2>Copy to Native draft</h2><p>Only reliable business fields are copied. The original route and vAMSYS ID remain unchanged; the new route receives a new internal ID.</p>{route.departureAirportId && route.arrivalAirportId ? <form action={copyRouteAction} className="form-grid"><input type="hidden" name="id" value={id}/><label>New route code<input name="routeCode" required defaultValue={`${route.routeCode ?? route.flightNumber ?? "ROUTE"}-N`}/></label><label><input type="checkbox" name="overrideConflicts" value="yes"/> Confirm conflict override if required</label><label>Override reason<input name="overrideReason"/></label><button className="button">Create Native draft</button></form> : <div className="notice">This Legacy route must first be mapped to internal departure and arrival Airport IDs.</div>}</section>}
    <section className="card"><h2>Future schedules and flights</h2><p className="meta">No schedule or dated flight is generated in TASK 5.2.</p></section>
    <section className="card"><h2>Recent audit activity</h2>{audit.length ? audit.map((row) => <p key={row.id}><strong>{row.action}</strong> · {row.createdAt.toLocaleString()}<br/><span className="meta">{row.message}</span></p>) : <p className="meta">No route audit events yet.</p>}</section>
  </>;
}
