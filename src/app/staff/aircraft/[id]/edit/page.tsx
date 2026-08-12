import { notFound, redirect } from "next/navigation";
import { AircraftManagementForm } from "@/components/aircraft-management-form";
import { findAircraftById } from "@/lib/native-flight/aircraft";
import { HISPAFLY_HUB_ICAOS } from "@/lib/native-flight/hubs";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { updateAircraftAction } from "../../actions";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  await requireStaffPermission("AIRCRAFT_EDIT", { entityType: "Aircraft", entityId: id, attemptedAction: "edit Aircraft" });
  const [aircraft, query, fleets, hubs] = await Promise.all([
    findAircraftById(id),
    searchParams,
    prisma.fleet.findMany({ where: { operationalStatus: "ACTIVE", dataOrigin: { not: "VAMSYS_LEGACY" } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.airport.findMany({ where: { status: "ACTIVE", archivedAt: null, icao: { in: [...HISPAFLY_HUB_ICAOS] } }, select: { id: true, icao: true, name: true }, orderBy: { icao: "asc" } }),
  ]);
  if (!aircraft) notFound();
  if (aircraft.dataOrigin === "VAMSYS_LEGACY" || aircraft.operationalStatus === "RETIRED") redirect(`/staff/aircraft/${id}?error=Aircraft%20is%20read-only.`);
  return <><h1>Edit {aircraft.registration}</h1>{query.error && <div className="notice">{query.error}</div>}<AircraftManagementForm action={updateAircraftAction} fleets={fleets} airports={hubs} value={aircraft}/></>;
}
