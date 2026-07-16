import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findAirportById } from "@/lib/native-flight/airport";
import { staffHasPermission } from "@/lib/staff/permissions";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { updateAirportAction, changeAirportStatusAction } from "../actions";
import { AirportForm } from "../airport-form";

export default async function AirportDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params, query = await searchParams;
  const [airport, staff, audit] = await Promise.all([
    findAirportById(id), getCurrentStaff(),
    prisma.aocAuditLog.findMany({ where: { entityType: "Airport", entityId: id }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  if (!airport) notFound();
  const editable = airport.dataOrigin !== "VAMSYS_LEGACY" && airport.status !== "ARCHIVED" && staffHasPermission(staff, "AIRPORT_EDIT");
  return <>
    <div className="page-header"><div><div className="eyebrow">{airport.dataOrigin}</div><h1>{airport.icao}{airport.iata ? ` / ${airport.iata}` : ""}</h1><p>{airport.name ?? "Unnamed airport"} · {airport.status}</p></div><Link href="/staff/airports">All airports</Link></div>
    {query.error && <div className="notice">{query.error}</div>}{query.success && <div className="notice">{query.success}</div>}
    {airport.dataOrigin === "VAMSYS_LEGACY" && <div className="notice">Legacy airport: historical read-only data. No external request will be sent.</div>}
    <div className="detail-grid"><section className="card"><h2>Identity</h2><p>City / country: {[airport.city, airport.country].filter(Boolean).join(", ") || "—"}</p><p>Timezone: {airport.timezone ?? "—"}</p><p>Coordinates: {airport.latitude ?? "—"}, {airport.longitude ?? "—"}</p><p>Legacy reference: {airport.legacyVamsysId ?? "—"}</p></section><section className="card"><h2>Operational impact</h2><p>Departure routes: {airport.departureRoutes.length}</p><p>Arrival routes: {airport.arrivalRoutes.length}</p><p>Current aircraft: {airport._count.currentAircraft}</p><p>Location history: {airport._count.locationSnapshots}</p></section></div>
    {editable && <><h2>Edit airport</h2><AirportForm action={updateAirportAction} airport={airport} submitLabel="Save airport"/></>}
    {(staffHasPermission(staff, "AIRPORT_EDIT") || staffHasPermission(staff, "AIRPORT_ARCHIVE")) && airport.dataOrigin !== "VAMSYS_LEGACY" && <section className="card danger-zone"><h2>Status control</h2><p>Routes and historical records remain preserved. Archived airports cannot be used by new routes or schedules.</p><form action={changeAirportStatusAction} className="inline-form"><input type="hidden" name="id" value={id}/><label>New status<select name="status" defaultValue={airport.status}><option>ACTIVE</option><option>INACTIVE</option>{staffHasPermission(staff, "AIRPORT_ARCHIVE") && <option>ARCHIVED</option>}</select></label><label>Reason<input name="reason" required/></label><button className="button danger">Confirm status change</button></form></section>}
    <section className="card"><h2>Related routes</h2>{[...airport.departureRoutes, ...airport.arrivalRoutes].length ? [...airport.departureRoutes, ...airport.arrivalRoutes].map((route) => <p key={route.id}><Link href={`/staff/routes/${route.id}`}>{route.routeCode ?? route.flightNumber ?? route.id}</Link> · {route.operationalStatus}</p>) : <p className="meta">No related routes.</p>}</section>
    <section className="card"><h2>Recent audit activity</h2>{audit.length ? audit.map((row) => <p key={row.id}><strong>{row.action}</strong> · {row.createdAt.toLocaleString()}<br/><span className="meta">{row.message}</span></p>) : <p className="meta">No airport audit events yet.</p>}</section>
  </>;
}
