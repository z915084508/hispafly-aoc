import Link from "next/link";
import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

export const dynamic = "force-dynamic";
const tone = (status: string) => status === "active" ? "green" as const : status === "on_leave" ? "amber" as const : "gray" as const;

export default async function PilotsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; success?: string; error?: string }> }) {
  await requireStaffPermission("PILOT_VIEW", { entityType: "Pilot", attemptedAction: "view RRHH Pilot directory" });
  const q = await searchParams, term = q.q?.trim();
  const [pilots, recentPilots] = await Promise.all([
    prisma.pilot.findMany({ where: { ...(q.status ? { status: q.status as "active" | "inactive" | "on_leave" } : {}), ...(term ? { OR: [{ displayName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { callsign: { contains: term, mode: "insensitive" } }, { username: { contains: term, mode: "insensitive" } }] } : {}) }, include: { authUser: true, _count: { select: { pireps: true, payrollRecords: true } } }, orderBy: [{ status: "asc" }, { displayName: "asc" }], take: 500 }),
    prisma.pilot.findMany({ include: { authUser: { select: { status: true, emailVerifiedAt: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const rows = pilots.map((pilot) => [<Identity key="pilot" primary={pilot.displayName} secondary={`${pilot.callsign ?? "No callsign"} · ${pilot.email ?? "No email"}`} />, pilot.rankName ?? pilot.rank ?? "—", pilot.base ?? "—", <Badge key="status" tone={tone(pilot.status)}>{pilot.status}</Badge>, pilot._count.pireps, pilot.authUser ? <Badge key="login" tone={pilot.authUser.status === "ACTIVE" ? "green" : "amber"}>{pilot.authUser.status}</Badge> : <Badge key="login" tone="gray">No login</Badge>, <Link key="open" className="action-button" href={`/staff/pilots/${pilot.id}`}>Open</Link>]);
  return <>
    <PageHeading eyebrow="RRHH · CREW ADMINISTRATION" title="Pilots" copy="Manage Pilot profiles, local identities, account recovery and legacy-record merges." />
    {q.success && <div className="feedback success">{q.success}</div>}{q.error && <div className="feedback error">{q.error}</div>}
    <section className="card"><div className="card-header"><h2 className="card-title">Recent Pilot Incorporations</h2><span className="meta">Latest registrations and activations</span></div><div className="table-wrap"><table><thead><tr><th>Pilot</th><th>Callsign</th><th>Registered</th><th>Identity status</th><th></th></tr></thead><tbody>{recentPilots.map((pilot) => <tr key={pilot.id}><td><strong>{pilot.displayName}</strong><br />{pilot.email ?? "—"}</td><td>{pilot.callsign ?? "—"}</td><td>{pilot.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td><td><Badge tone={pilot.authUser?.status === "ACTIVE" ? "green" : "amber"}>{pilot.authUser?.status ?? pilot.status.toUpperCase()}</Badge>{pilot.authUser?.emailVerifiedAt && <><br /><small>Activated {pilot.authUser.emailVerifiedAt.toISOString().slice(0, 10)}</small></>}</td><td><Link className="action-button" href={`/staff/pilots/${pilot.id}`}>Open</Link></td></tr>)}</tbody></table></div></section>
    <form className="card inline-form"><label>Search<input name="q" defaultValue={q.q} placeholder="Name, email, callsign or username" /></label><label>Status<select name="status" defaultValue={q.status ?? ""}><option value="">All</option><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option></select></label><button className="button">FILTER</button></form>
    <div className="card">{pilots.length ? <DataTable headers={["Pilot", "Rank", "Base", "Status", "PIREPs", "Identity", ""]} rows={rows} /> : <p className="meta">No pilots match this filter.</p>}</div>
  </>;
}
