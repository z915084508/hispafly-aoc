import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { findRouteById } from "@/lib/native-flight/route";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { updateRouteAction } from "../../actions";
import { RouteForm } from "../../route-form";
export default async function EditRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  await requireStaffPermission("ROUTE_EDIT", { entityType: "Route", entityId: id, attemptedAction: "open route editor" });
  const [query, route, airports, fleets] = await Promise.all([
    searchParams, findRouteById(id),
    prisma.airport.findMany({ where: { status: "ACTIVE" }, orderBy: { icao: "asc" }, select: { id: true, icao: true, name: true } }),
    prisma.fleet.findMany({ where: { active: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  if (!route) notFound();
  if (route.operationalStatus === "ARCHIVED") redirect(`/staff/routes/${id}?error=This%20route%20is%20read-only.`);
  return <><div className="page-header"><div><div className="eyebrow">NETWORK PLANNING</div><h1>Edit {route.routeCode}</h1><p>Changes are local to HispaFly and are written to the audit log.</p></div><Link href={`/staff/routes/${id}`}>Back</Link></div>{query.error && <div className="notice">{query.error}</div>}<RouteForm action={updateRouteAction} route={route} airports={airports.map((a) => ({ id: a.id, label: `${a.icao} · ${a.name ?? "Unnamed"}` }))} fleets={fleets.map((f) => ({ id: f.id, label: f.code ?? f.name ?? f.id }))} submitLabel="Save route"/></>;
}
