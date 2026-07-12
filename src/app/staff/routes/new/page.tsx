import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { RouteForm } from "@/components/route-form";
import { createAndPublishRouteAction } from "../actions";
export default async function NewRoutePage({searchParams}:{searchParams:Promise<{error?:string}>}) { await requireStaffPermission("ROUTE_CREATE",{entityType:"Route",attemptedAction:"create route"}); const [{error},airports,fleets]=await Promise.all([searchParams,prisma.airport.findMany({orderBy:{icao:"asc"}}),prisma.fleet.findMany({orderBy:{name:"asc"}})]); return <><div className="page-header"><div><div className="eyebrow">VAMSYS ROUTES</div><h1>New route</h1><p>vAMSYS fields are published immediately after validation.</p></div></div>{error&&<div className="notice error">{error}</div>}<RouteForm action={createAndPublishRouteAction} airports={airports} fleets={fleets}/></>; }
