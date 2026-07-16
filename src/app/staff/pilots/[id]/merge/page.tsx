import Link from "next/link";
import {notFound} from "next/navigation";
import {requireStaffPermission} from "@/lib/staff/authorization";
import {previewPilotMerge} from "@/lib/hr/pilot-merge";
import {mergePilotAction} from "../actions";
const counts=(p:Awaited<ReturnType<typeof previewPilotMerge>>["source"])=>[
 ["PIREPs",p._count.pireps],["Payroll",p._count.payrollRecords],["Wallet",p._count.walletTransactions],
 ["Dispatches",p._count.flightDispatches],["Bookings",p._count.pilotBookings],["EFB",p._count.efbPerformanceCalculations],
];
export default async function MergePreview({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{sourceId?:string}>}){
 const {id}=await params,{sourceId}=await searchParams;await requireStaffPermission("PILOT_MERGE",{entityType:"Pilot",entityId:id,attemptedAction:"preview Pilot merge"});if(!sourceId)notFound();
 const preview=await previewPilotMerge(sourceId,id);
 return <><div className="page-header"><div><div className="eyebrow">RRHH · ACCOUNT MERGE</div><h1>Review merge</h1><p>Source data moves into the target account. This cannot be automatically undone.</p></div><Link className="button secondary" href={`/staff/pilots/${id}`}>Cancel</Link></div>
 <div className="detail-grid"><section className="card danger-zone"><h2>Source · will be removed</h2><p><strong>{preview.source.displayName}</strong><br/>{preview.source.callsign??"No callsign"} · {preview.source.email??"No email"}</p><p>Local login: {preview.source.authUserId?"Yes":"No"}<br/>VAMSYS ID: {preview.source.vamsysPilotId??"—"}<br/>Balance: {(preview.source.walletBalanceCents/100).toFixed(2)} EUR</p>{counts(preview.source).map(([label,value])=><p key={label}>{label}: <strong>{value}</strong></p>)}</section>
 <section className="card"><h2>Target · will be retained</h2><p><strong>{preview.target.displayName}</strong><br/>{preview.target.callsign??"No callsign"} · {preview.target.email??"No email"}</p><p>Local login: {preview.target.authUserId?"Yes":"No"}<br/>VAMSYS ID: {preview.target.vamsysPilotId??"—"}<br/>Balance: {(preview.target.walletBalanceCents/100).toFixed(2)} EUR</p>{counts(preview.target).map(([label,value])=><p key={label}>{label}: <strong>{value}</strong></p>)}</section></div>
 {preview.warnings.length>0&&<section className="card danger-zone"><h2>Warnings</h2>{preview.warnings.map(w=><p key={w}>{w}</p>)}</section>}
 <section className="card danger-zone"><h2>Final confirmation</h2><p>The operation runs in a serializable database transaction and writes an audit event. Active sessions belonging to a removed source identity will be revoked.</p><form action={mergePilotAction} className="inline-form"><input type="hidden" name="targetId" value={id}/><input type="hidden" name="sourceId" value={sourceId}/><label>Type MERGE<input name="confirmation" required autoComplete="off"/></label><button className="button danger">MERGE ACCOUNTS</button></form></section></>;
}
