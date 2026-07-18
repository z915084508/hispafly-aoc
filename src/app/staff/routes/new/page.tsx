import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { createRouteAction } from "../actions";
import { RouteForm } from "../route-form";
export default async function NewRoute({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireStaffPermission("ROUTE_CREATE", { entityType: "Route", attemptedAction: "open new route form" });
  const [query, airports, fleets] = await Promise.all([
    searchParams,
    prisma.airport.findMany({ where: { status: "ACTIVE" }, orderBy: { icao: "asc" }, select: { id: true, icao: true, name: true } }),
    prisma.fleet.findMany({ where: { active: true, dataOrigin: { not: "VAMSYS_LEGACY" } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  return <><div className="page-header route-builder-header"><div><div className="eyebrow">NETWORK PLANNING</div><h1>Build a new route</h1><p>Create one reusable Airport pair for schedules, Dispatch and ACARS.</p></div><Link className="button secondary" href="/staff/routes">← All routes</Link></div>{query.error && <div className="feedback error">{query.error}</div>}<RouteForm action={createRouteAction} airports={airports.map((a) => ({ id: a.id, label: `${a.icao} · ${a.name ?? "Unnamed"}` }))} fleets={fleets.map((f) => ({ id: f.id, label: f.code ?? f.name ?? f.id }))} submitLabel="Create draft route"/></>;
}
