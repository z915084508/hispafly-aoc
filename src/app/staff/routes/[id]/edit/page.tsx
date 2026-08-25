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
    searchParams,
    findRouteById(id),
    prisma.airport.findMany({ where: { status: "ACTIVE" }, orderBy: { icao: "asc" }, select: { id: true, icao: true, name: true, country: true } }),
    prisma.fleet.findMany({ where: { active: true, operationalStatus: "ACTIVE" }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  if (!route) notFound();
  if (route.operationalStatus === "ARCHIVED") redirect(`/staff/routes/${id}?error=This%20route%20is%20read-only.`);

  const routeValue = {
    id: route.id,
    routeCode: route.routeCode,
    flightNumber: route.flightNumber,
    callsign: route.callsign,
    departureAirportId: route.departureAirportId,
    arrivalAirportId: route.arrivalAirportId,
    compatibleFleetIds: route.fleetAssignments.map(({ fleetId }) => fleetId),
    scheduledDurationMinutes: route.scheduledDurationMinutes,
    cruiseAltitude: route.cruiseAltitude,
    route: route.route,
    networkPolicy: route.networkPolicy,
    effectiveFrom: route.effectiveFrom,
    effectiveUntil: route.effectiveUntil,
    internalNotes: route.internalNotes,
  };

  return <>
    <div className="page-header"><div><div className="eyebrow">NETWORK PLANNING</div><h1>Edit {route.routeCode}</h1><p>Generated identity and Airport pair are locked. Planning defaults remain editable and audited.</p></div><Link href={`/staff/routes/${id}`}>Back</Link></div>
    {query.error && <div className="feedback error">{query.error}</div>}
    <RouteForm
      action={updateRouteAction}
      route={routeValue}
      airports={airports.map((airport) => ({ id: airport.id, label: `${airport.icao} · ${airport.name ?? "Unnamed"}${airport.country ? ` · ${airport.country}` : ""}` }))}
      fleets={fleets.map((fleet) => ({ id: fleet.id, label: fleet.code ?? fleet.name ?? fleet.id }))}
      submitLabel="Save route"
    />
  </>;
}
