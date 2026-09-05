import Link from "next/link";
import { Badge } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { listActivePilotRiskFlags } from "@/lib/pilot-risk/repository";
import type { PilotRiskSeverity } from "@/lib/pilot-risk/types";
import { createManualRiskFlagAction, refreshRiskSignalsAction, reviewRiskFlagAction } from "./actions";

export const dynamic="force-dynamic";
const severityTone=(severity:PilotRiskSeverity)=>severity==="CRITICAL"?"red" as const:severity==="HIGH"?"red" as const:severity==="MODERATE"?"amber" as const:"blue" as const;

export default async function PilotStandardsPage({searchParams}:{searchParams:Promise<{success?:string;error?:string}>}){
  await requireStaffPermission("PILOT_PERFORMANCE_VIEW",{entityType:"PilotRiskFlag",attemptedAction:"view Pilot Standards risk workspace"});
  const [q,flags,pilots]=await Promise.all([
    searchParams,
    listActivePilotRiskFlags(),
    prisma.pilot.findMany({where:{status:"active"},select:{id:true,displayName:true,callsign:true,rankName:true,rank:true},orderBy:{displayName:"asc"}}),
  ]);
  const pilotById=new Map(pilots.map(p=>[p.id,p]));
  const critical=flags.filter(f=>f.severity==="CRITICAL").length,high=flags.filter(f=>f.severity==="HIGH").length,confirmed=flags.filter(f=>f.status==="CONFIRMED").length;
  return <>
    <PageHeading eyebrow="FLIGHT OPERATIONS · STANDARDS" title="Pilot Standards" copy="Risk detection and review workspace. Risk flags are detection signals and do not create promotion or dispatch restrictions by themselves." />
    {q.success&&<div className="feedback success">{q.success}</div>}{q.error&&<div className="feedback error">{q.error}</div>}
    <section className="grid stats">
      <div className="card"><div className="stat-label">ACTIVE RISK FLAGS</div><div className="stat-value">{flags.length}</div><div className="stat-note">Open and confirmed</div></div>
      <div className="card"><div className="stat-label">CRITICAL</div><div className="stat-value">{critical}</div><div className="stat-note">Requires priority Standards review</div></div>
      <div className="card"><div className="stat-label">HIGH</div><div className="stat-value">{high}</div><div className="stat-note">Material operational concern</div></div>
      <div className="card"><div className="stat-label">CONFIRMED</div><div className="stat-value">{confirmed}</div><div className="stat-note">Reviewed by STAFF · still not an automatic restriction</div></div>
    </section>
    <section className="card"><div className="card-header"><div><h2 className="card-title">Detection Engine</h2><p className="meta">Refreshes persisted risk signals from the current LAST 10 performance trend. Repeated detections increase occurrence count instead of creating duplicates.</p></div><form action={refreshRiskSignalsAction}><button className="button">REFRESH TREND SIGNALS</button></form></div></section>
    <section className="card"><div className="card-header"><div><h2 className="card-title">Active Risk Queue</h2><p className="meta">Confirm only after reviewing the underlying evidence. Dismiss false positives; resolve risks after corrective action or sufficient evidence.</p></div></div>{flags.length?<div className="table-wrap"><table><thead><tr><th>Pilot</th><th>Risk</th><th>Source</th><th>Severity</th><th>Status</th><th>Occurrences</th><th>Last detected</th><th>Review</th></tr></thead><tbody>{flags.map(flag=>{const pilot=pilotById.get(flag.pilotId);return <tr key={flag.id}><td><strong>{pilot?.displayName??flag.pilotId}</strong><br/><small>{pilot?.callsign??"—"} · {pilot?.rankName??pilot?.rank??"—"}</small></td><td><strong>{flag.title}</strong><br/><small>{flag.reason}</small></td><td>{flag.source}<br/><small>{flag.category}</small></td><td><Badge tone={severityTone(flag.severity)}>{flag.severity}</Badge></td><td><Badge tone={flag.status==="CONFIRMED"?"amber":"blue"}>{flag.status}</Badge></td><td>{flag.occurrenceCount}</td><td>{flag.lastDetectedAt.toISOString().slice(0,16).replace("T"," ")} UTC</td><td><form action={reviewRiskFlagAction} className="inline-form"><input type="hidden" name="id" value={flag.id}/><input type="hidden" name="pilotId" value={flag.pilotId}/><input name="comment" placeholder="Review note"/><select name="decision" defaultValue="CONFIRMED"><option value="CONFIRMED">Confirm</option><option value="DISMISSED">Dismiss</option><option value="RESOLVED">Resolve</option></select><button className="action-button">APPLY</button></form><Link className="action-button" href={`/staff/pilots/${flag.pilotId}`}>Pilot</Link></td></tr>})}</tbody></table></div>:<p className="meta">No active risk flags.</p>}</section>
    <section className="card"><div className="card-header"><div><h2 className="card-title">Manual Standards Flag</h2><p className="meta">For observed issues not yet produced by an automated adapter. Manual flags still require explicit review before Phase 2.3 can use them for a restriction.</p></div></div><form action={createManualRiskFlagAction} className="form-grid"><label>Pilot<select name="pilotId" required defaultValue=""><option value="" disabled>Select pilot</option>{pilots.map(p=><option key={p.id} value={p.id}>{p.displayName} · {p.callsign??"—"}</option>)}</select></label><label>Category<select name="category" defaultValue="OTHER"><option>SAFETY</option><option>SOP</option><option>OPERATIONS</option><option>RELIABILITY</option><option>COMMAND</option><option>APPROACH_STABILITY</option><option>LANDING_TECHNIQUE</option><option>CONDUCT</option><option>OTHER</option></select></label><label>Severity<select name="severity" defaultValue="MODERATE"><option>LOW</option><option>MODERATE</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Title<input name="title" required placeholder="Observed risk"/></label><label>Reason<textarea name="reason" required placeholder="Evidence and operational context"/></label><button className="button">CREATE RISK FLAG</button></form></section>
  </>;
}
