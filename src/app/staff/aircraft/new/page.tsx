import { AircraftManagementForm } from "@/components/aircraft-management-form";
import { HISPAFLY_HUB_ICAOS } from "@/lib/native-flight/hubs";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { createAircraftAction } from "../actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireStaffPermission("AIRCRAFT_CREATE", { entityType: "Aircraft", attemptedAction: "open Aircraft creation" });
  const [query, fleets, hubs] = await Promise.all([
    searchParams,
    prisma.fleet.findMany({ where: { operationalStatus: "ACTIVE" }, select: { id: true, code: true, name: true, type: true, typicalSeatCapacity: true, maxPassengers: true, maxCargoKg: true }, orderBy: { code: "asc" } }),
    prisma.airport.findMany({ where: { status: "ACTIVE", archivedAt: null, icao: { in: [...HISPAFLY_HUB_ICAOS] } }, select: { id: true, icao: true, name: true }, orderBy: { icao: "asc" } }),
  ]);
  return <><h1>New Aircraft</h1>{query.error && <div className="notice">{query.error}</div>}<AircraftManagementForm action={createAircraftAction} fleets={fleets} airports={hubs}/></>;
}
