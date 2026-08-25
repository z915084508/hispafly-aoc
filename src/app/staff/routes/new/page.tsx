import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { createRouteAction } from "../actions";
import { RouteForm } from "../route-form";

export default async function NewRoute({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireStaffPermission("ROUTE_CREATE", { entityType: "Route", attemptedAction: "open new route form" });
  const [query, airports, fleets] = await Promise.all([
    searchParams,
    prisma.airport.findMany({
      where: { status: "ACTIVE" },
      orderBy: { icao: "asc" },
      select: { id: true, icao: true, name: true, country: true },
    }),
    prisma.fleet.findMany({
      where: { active: true, operationalStatus: "ACTIVE" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);
  return <>
    <div className="page-header route-builder-header"><div><div className="eyebrow">NETWORK PLANNING</div><h1>Build a new route</h1><p>Select the Airport pair and compatible fleets. Flight number and callsign are assigned later when Programación creates the flight.</p></div><Link className="button secondary" href="/staff/routes">← All routes</Link></div>
    {query.error && <div className="feedback error">{query.error}</div>}
    <RouteForm
      action={createRouteAction}
      airports={airports.map((airport) => ({ id: airport.id, label: `${airport.icao} · ${airport.name ?? "Unnamed"}${airport.country ? ` · ${airport.country}` : " · Country missing"}` }))}
      fleets={fleets.map((fleet) => ({ id: fleet.id, label: fleet.code ?? fleet.name ?? fleet.id }))}
      submitLabel="Create draft route"
    />
  </>;
}
