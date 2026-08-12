import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { setAcarsBetaAccessAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AcarsAccessPage({ searchParams }: { searchParams: Promise<{ q?: string; access?: string; success?: string; error?: string }> }) {
  await requireStaffPermission("ACARS_ACCESS_VIEW", { entityType: "Pilot", attemptedAction: "view ACARS Beta Access management" });
  const query = await searchParams;
  const term = query.q?.trim();
  const pilots = await prisma.pilot.findMany({
    where: {
      ...(query.access === "enabled" ? { acarsBetaAccess: true } : query.access === "disabled" ? { acarsBetaAccess: false } : {}),
      ...(term ? { OR: [{ displayName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { callsign: { contains: term, mode: "insensitive" } }] } : {}),
    },
    include: { authUser: true },
    orderBy: [{ acarsBetaAccess: "desc" }, { displayName: "asc" }],
    take: 500,
  });
  const rows = pilots.map((pilot) => [
    <Identity key="pilot" primary={pilot.displayName} secondary={`${pilot.callsign ?? "No callsign"} · ${pilot.email ?? "No email"}`} />,
    pilot.authUser ? <Badge key="identity" tone={pilot.authUser.status === "ACTIVE" ? "green" : "amber"}>{pilot.authUser.status}</Badge> : <Badge key="identity" tone="gray">No login</Badge>,
    <Badge key="access" tone={pilot.acarsBetaAccess ? "green" : "gray"}>{pilot.acarsBetaAccess ? "BETA ENABLED" : "DISABLED"}</Badge>,
    <form key="action" action={setAcarsBetaAccessAction}>
      <input type="hidden" name="pilotId" value={pilot.id} />
      <input type="hidden" name="enabled" value={pilot.acarsBetaAccess ? "false" : "true"} />
      <button className={`action-button${pilot.acarsBetaAccess ? " danger" : ""}`}>{pilot.acarsBetaAccess ? "Revoke access" : "Grant Beta access"}</button>
    </form>,
  ]);
  return <>
    <PageHeading eyebrow="ACARS · BETA CONTROL" title="ACARS Access" copy="Grant or revoke ACARS Beta access for individual pilot accounts. Account status and Pilot permissions remain unchanged." />
    {query.success && <div className="feedback success">{query.success === "access_granted" ? "ACARS Beta access granted." : "ACARS Beta access revoked."}</div>}
    {query.error && <div className="feedback error">Pilot not found.</div>}
    <form className="card inline-form">
      <label>Search<input name="q" defaultValue={query.q} placeholder="Name, email or callsign" /></label>
      <label>Access<select name="access" defaultValue={query.access ?? ""}><option value="">All</option><option value="enabled">Beta enabled</option><option value="disabled">Disabled</option></select></label>
      <button className="button">FILTER</button>
    </form>
    <div className="card">{pilots.length ? <DataTable headers={["Pilot", "Identity", "ACARS access", ""]} rows={rows} /> : <p className="meta">No pilots match this filter.</p>}</div>
  </>;
}
