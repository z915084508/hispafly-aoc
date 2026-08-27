import Link from "next/link";
import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { HISPAFLY_HUB_ICAOS } from "@/lib/native-flight/hubs";
import { InlinePilotHub, InlinePilotLocation } from "@/components/pilot-inline-manager";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import { buildPilotPerformanceTrend, type TrendDirection } from "@/lib/pilot-evaluation/trend";

export const dynamic = "force-dynamic";
const tone = (status: string) => status === "active" ? "green" as const : status === "on_leave" ? "amber" as const : "gray" as const;
const trendTone=(direction:TrendDirection)=>direction==="IMPROVING"?"green" as const:direction==="DECLINING"?"red" as const:direction==="STABLE"?"blue" as const:"gray" as const;
const trendSymbol=(direction:TrendDirection)=>direction==="IMPROVING"?"↑":direction==="DECLINING"?"↓":direction==="STABLE"?"→":"—";

export default async function PilotsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; hub?: string; success?: string; error?: string }> }) {
  await requireStaffPermission("PILOT_VIEW", { entityType: "Pilot", attemptedAction: "view RRHH Pilot directory" });
  const q = await searchParams, term = q.q?.trim();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [pilots, recentPilots, hubCounts, airports, staff] = await Promise.all([
    prisma.pilot.findMany({ where: { ...(q.status ? { status: q.status as "active" | "inactive" | "on_leave" } : {}), ...(q.hub && HISPAFLY_HUB_ICAOS.includes(q.hub as (typeof HISPAFLY_HUB_ICAOS)[number]) ? { hubId: q.hub } : {}), ...(term ? { OR: [{ displayName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { callsign: { contains: term, mode: "insensitive" } }, { username: { contains: term, mode: "insensitive" } }] } : {}) }, include: { authUser: true, currentAirport: { select: { icao: true } }, evaluationPeriods:{where:{windowType:"LAST_10_FLIGHTS"},orderBy:{calculatedAt:"desc"},take:2,select:{calculatedAt:true,overallScore:true,safetyScore:true,sopScore:true,operationsScore:true,reliabilityScore:true,commandReadinessScore:true}}, _count: { select: { pireps: true, payrollRecords: true } } }, orderBy: [{ status: "asc" }, { displayName: "asc" }], take: 500 }),
    prisma.pilot.findMany({ where: { OR: [{ createdAt: { gte: monthStart, lt: monthEnd } }, { authUser: { emailVerifiedAt: { gte: monthStart, lt: monthEnd } } }] }, include: { authUser: { select: { status: true, emailVerifiedAt: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.pilot.groupBy({ by: ["hubId"], where: { hubId: { in: [...HISPAFLY_HUB_ICAOS] } }, _count: { _all: true } }),
    prisma.airport.findMany({ where: { status: "ACTIVE", archivedAt: null }, select: { id: true, icao: true, name: true }, orderBy: { icao: "asc" } }),
    getCurrentStaff(),
  ]);
  const counts = new Map(hubCounts.map((row) => [row.hubId, row._count._all]));
  const hubAirports = airports.filter((airport) => HISPAFLY_HUB_ICAOS.includes(airport.icao as (typeof HISPAFLY_HUB_ICAOS)[number]));
  const canManage = staffHasPermission(staff, "PILOT_EDIT");
  const params = new URLSearchParams(Object.entries(q).filter((entry): entry is [string,string] => Boolean(entry[1]))); params.delete("success"); params.delete("error");
  const returnTo = `/staff/pilots${params.size ? `?${params}` : ""}`;
  const pilotsWithTrend=pilots.map(pilot=>({pilot,trend:buildPilotPerformanceTrend(pilot.evaluationPeriods)}));
  const decliningPilots=pilotsWithTrend.filter(({trend})=>trend.direction==="DECLINING");
  const rows = pilotsWithTrend.map(({pilot,trend}) => [<Identity key="pilot" primary={pilot.displayName} secondary={`${pilot.callsign ?? "No callsign"} · ${pilot.email ?? "No email"}`} />, <InlinePilotHub key="hub" pilotId={pilot.id} returnTo={returnTo} canManage={canManage} airports={hubAirports} hub={pilot.hubId}/>, <InlinePilotLocation key="location" pilotId={pilot.id} returnTo={returnTo} canManage={canManage} airports={airports} airportId={pilot.currentAirportId} label={pilot.currentAirport?.icao ?? "Unknown"}/>, pilot.rankName ?? pilot.rank ?? "—", <Badge key="status" tone={tone(pilot.status)}>{pilot.status}</Badge>, <Badge key="trend" tone={trendTone(trend.direction)}>{trendSymbol(trend.direction)} {trend.direction.replaceAll("_"," ")}</Badge>, pilot._count.pireps, pilot.authUser ? <Badge key="login" tone={pilot.authUser.status === "ACTIVE" ? "green" : "amber"}>{pilot.authUser.status}</Badge> : <Badge key="login" tone="gray">No login</Badge>, <Link key="open" className="action-button" href={`/staff/pilots/${pilot.id}`}>Open</Link>]);
  return <>
    <PageHeading eyebrow="RRHH · CREW ADMINISTRATION" title="Pilots" copy="Manage Pilot profiles, local identities, account recovery and legacy-record merges." />
    {q.success && <div className="feedback success">{q.success}</div>}{q.error && <div className="feedback error">{q.error}</div>}
    <section className="grid stats">{HISPAFLY_HUB_ICAOS.map((hub)=><Link className="card" href={`/staff/pilots?hub=${hub}`} key={hub}><div className="stat-label">PILOTS · {hub}</div><div className="stat-value">{counts.get(hub)??0}</div><div className="stat-note">View pilots assigned to this HUB</div></Link>)}<div className="card"><div className="stat-label">STANDARDS WATCHLIST</div><div className="stat-value">{decliningPilots.length}</div><div className="stat-note">Pilots with materially declining LAST 10 trend</div></div></section>
    {decliningPilots.length>0&&<section className="card"><div className="card-header"><h2 className="card-title">Performance Watchlist</h2><span className="meta">Detection signal only · no automatic disciplinary action</span></div><div className="table-wrap"><table><thead><tr><th>Pilot</th><th>Trend</th><th>Safety</th><th>SOP</th><th></th></tr></thead><tbody>{decliningPilots.map(({pilot,trend})=>{const safety=trend.metrics.find(metric=>metric.metric==="safetyScore"),sop=trend.metrics.find(metric=>metric.metric==="sopScore");return <tr key={pilot.id}><td><strong>{pilot.displayName}</strong><br/><small>{pilot.callsign??"—"}</small></td><td><Badge tone="red">↓ DECLINING</Badge></td><td>{safety?.current??"—"}{safety?.delta!==null&&safety?.delta!==undefined?` (${safety.delta>0?"+":""}${safety.delta})`:""}</td><td>{sop?.current??"—"}{sop?.delta!==null&&sop?.delta!==undefined?` (${sop.delta>0?"+":""}${sop.delta})`:""}</td><td><Link className="action-button" href={`/staff/pilots/${pilot.id}`}>Review</Link></td></tr>})}</tbody></table></div></section>}
    <section className="card"><div className="card-header"><h2 className="card-title">Recent Pilot Incorporations</h2><span className="meta">Current month registrations and activations</span></div>{recentPilots.length ? <div className="table-wrap"><table><thead><tr><th>Pilot</th><th>Callsign</th><th>Registered</th><th>Identity status</th><th></th></tr></thead><tbody>{recentPilots.map((pilot) => <tr key={pilot.id}><td><strong>{pilot.displayName}</strong><br />{pilot.email ?? "—"}</td><td>{pilot.callsign ?? "—"}</td><td>{pilot.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td><td><Badge tone={pilot.authUser?.status === "ACTIVE" ? "green" : "amber"}>{pilot.authUser?.status ?? pilot.status.toUpperCase()}</Badge>{pilot.authUser?.emailVerifiedAt && <><br /><small>Activated {pilot.authUser.emailVerifiedAt.toISOString().slice(0, 10)}</small></>}</td><td><Link className="action-button" href={`/staff/pilots/${pilot.id}`}>Open</Link></td></tr>)}</tbody></table></div> : <p className="meta">No Pilot incorporations this month.</p>}</section>
    <form className="card inline-form"><label>Search<input name="q" defaultValue={q.q} placeholder="Name, email, callsign or username" /></label><label>HUB<select name="hub" defaultValue={q.hub??""}><option value="">All HUBS</option>{HISPAFLY_HUB_ICAOS.map((hub)=><option key={hub}>{hub}</option>)}</select></label><label>Status<select name="status" defaultValue={q.status ?? ""}><option value="">All</option><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option></select></label><button className="button">FILTER</button></form>
    <div className="card">{pilots.length ? <DataTable headers={["Pilot", "HUB", "Location", "Rank", "Status", "Trend", "PIREPs", "Identity", ""]} rows={rows} /> : <p className="meta">No pilots match this filter.</p>}</div>
  </>;
}
