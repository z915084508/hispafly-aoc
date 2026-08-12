import Link from "next/link";
import type { NativeAircraftStatus } from "@prisma/client";
import { InlineHubs, InlineLocation, InlineStatus } from "@/components/aircraft-inline-manager";
import { prisma } from "@/lib/prisma";
import { listAircraft } from "@/lib/native-flight/aircraft";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

const aircraftStatuses = ["AVAILABLE","RESERVED","DISPATCHED","IN_FLIGHT","TURNAROUND","MAINTENANCE","FERRY_ONLY","AOG","SUSPENDED","RETIRED","UNKNOWN"];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const query = await searchParams;
  const [staff, result, fleets, airports] = await Promise.all([
    getCurrentStaff(),
    listAircraft({ search: query.search, fleetId: query.fleetId, airportId: query.airportId, status: query.status as NativeAircraftStatus | undefined, maintenanceStatus: query.maintenanceStatus, dataOrigin: query.source, page: Number(query.page) || 1 }),
    prisma.fleet.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.airport.findMany({ where: { status: "ACTIVE", archivedAt: null }, select: { id: true, icao: true, name: true }, orderBy: { icao: "asc" } }),
  ]);
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string,string] => Boolean(entry[1])));
  params.delete("success"); params.delete("error");
  const returnTo = `/staff/aircraft${params.size ? `?${params}` : ""}`;
  const canEditHubs = staffHasPermission(staff, "AIRCRAFT_EDIT");
  const canManageLocation = staffHasPermission(staff, "AIRCRAFT_LOCATION_MANAGE");
  const canManageStatus = staffHasPermission(staff, "AIRCRAFT_STATUS_MANAGE");

  return <>
    <div className="page-header"><div><div className="eyebrow">AIRCRAFT CONTROL</div><h1>Aircraft</h1><p>Manage operational HUBS, current location and status directly from the fleet table.</p></div>{staffHasPermission(staff,"AIRCRAFT_CREATE") && <Link className="button" href="/staff/aircraft/new">New Aircraft</Link>}</div>
    {query.error && <div className="feedback error">{query.error}</div>}{query.success && <div className="feedback success">{query.success}</div>}
    <form className="audit-filters"><label>Registration<input name="search" defaultValue={query.search}/></label><label>Fleet<select name="fleetId" defaultValue={query.fleetId??""}><option value="">All</option>{fleets.map((fleet)=><option key={fleet.id} value={fleet.id}>{fleet.code??fleet.name}</option>)}</select></label><label>Airport<select name="airportId" defaultValue={query.airportId??""}><option value="">All</option>{airports.map((airport)=><option key={airport.id} value={airport.id}>{airport.icao}</option>)}</select></label><label>Status<select name="status" defaultValue={query.status??""}><option value="">All</option>{aircraftStatuses.map((status)=><option key={status}>{status}</option>)}</select></label><label>Maintenance<select name="maintenanceStatus" defaultValue={query.maintenanceStatus??""}><option value="">All</option>{["NONE","REQUIRED","FERRY_TO_BASE","WAITING_MAINTENANCE","IN_PROGRESS","COMPLETED"].map((status)=><option key={status}>{status}</option>)}</select></label><label>Source<select name="source" defaultValue={query.source??""}><option value="">All</option><option>HISPAFLY_NATIVE</option><option>IMPORTED</option><option>MANUAL</option><option>VAMSYS_LEGACY</option></select></label><button className="button secondary">Filter</button></form>
    <div className="table-wrap"><table><thead><tr><th>Registration</th><th>Fleet/type</th><th>HUBS</th><th>Location</th><th>Status</th><th>Maintenance</th><th>Hours/cycles</th><th>Last report</th></tr></thead><tbody>{result.rows.map((aircraft)=>{const native=aircraft.dataOrigin!=="VAMSYS_LEGACY";return <tr key={aircraft.id}><td><Link href={`/staff/aircraft/${aircraft.id}`}><strong>{aircraft.registration??"—"}</strong></Link></td><td>{aircraft.nativeFleet?.code??aircraft.fleetName??"—"} / {aircraft.aircraftType??"—"}</td><td><InlineHubs aircraftId={aircraft.id} returnTo={returnTo} canManage={native&&canEditHubs} airports={airports} hubs={aircraft.hubs}/></td><td><InlineLocation aircraftId={aircraft.id} returnTo={returnTo} canManage={native&&canManageLocation} airports={airports} airportId={aircraft.currentAirportId} label={aircraft.currentAirport?.icao??aircraft.locationSnapshot?.currentAirportIcao??"Unknown"} status={aircraft.operationalStatus}/></td><td><InlineStatus aircraftId={aircraft.id} returnTo={returnTo} canManage={native&&canManageStatus} status={aircraft.operationalStatus}/></td><td>{aircraft.conditionSnapshot?.maintenanceStatus??"NONE"}</td><td>{(aircraft.totalFlightMinutes/60).toFixed(1)} / {aircraft.totalCycles}</td><td>{aircraft.locationSnapshot?.lastReportAt?.toLocaleString()??"—"}</td></tr>})}</tbody></table></div>
    <div className="button-row"><span>{result.total} aircraft</span>{result.page>1&&<Link href={`?page=${result.page-1}`}>Previous</Link>}{result.page*result.pageSize<result.total&&<Link href={`?page=${result.page+1}`}>Next</Link>}</div>
  </>;
}
