import Link from "next/link";
import {Badge,DataTable,Identity} from "@/components/data-table";
import {PageHeading} from "@/components/page-heading";
import {prisma} from "@/lib/prisma";
import {requireStaffPermission} from "@/lib/staff/authorization";
export const dynamic="force-dynamic";
const tone=(status:string)=>status==="active"?"green" as const:status==="on_leave"?"amber" as const:"gray" as const;
export default async function PilotsPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;success?:string;error?:string}>}){
 await requireStaffPermission("PILOT_VIEW",{entityType:"Pilot",attemptedAction:"view RRHH Pilot directory"});const q=await searchParams,term=q.q?.trim();
 const pilots=await prisma.pilot.findMany({where:{...(q.status?{status:q.status as "active"|"inactive"|"on_leave"}:{}),...(term?{OR:[{displayName:{contains:term,mode:"insensitive"}},{email:{contains:term,mode:"insensitive"}},{callsign:{contains:term,mode:"insensitive"}},{username:{contains:term,mode:"insensitive"}}]}:{})},include:{authUser:true,_count:{select:{pireps:true,payrollRecords:true}}},orderBy:[{status:"asc"},{displayName:"asc"}],take:500});
 const rows=pilots.map(p=>[<Identity key="pilot" primary={p.displayName} secondary={`${p.callsign??"No callsign"} · ${p.email??"No email"}`}/>,p.rankName??p.rank??"—",p.base??"—",<Badge key="status" tone={tone(p.status)}>{p.status}</Badge>,p._count.pireps,p.authUser?<Badge key="login" tone={p.authUser.status==="ACTIVE"?"green":"amber"}>{p.authUser.status}</Badge>:<Badge key="login" tone="gray">No login</Badge>,<Link key="open" className="action-button" href={`/staff/pilots/${p.id}`}>Open</Link>]);
 return <><PageHeading eyebrow="RRHH · CREW ADMINISTRATION" title="Pilots" copy="Manage Pilot profiles, local identities, account recovery and legacy-record merges."/>
 {q.success&&<div className="feedback success">{q.success}</div>}{q.error&&<div className="feedback error">{q.error}</div>}
 <form className="card inline-form"><label>Search<input name="q" defaultValue={q.q} placeholder="Name, email, callsign or username"/></label><label>Status<select name="status" defaultValue={q.status??""}><option value="">All</option><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option></select></label><button className="button">FILTER</button></form>
 <div className="card">{pilots.length?<DataTable headers={["Pilot","Rank","Base","Status","PIREPs","Identity",""]} rows={rows}/>:<p className="meta">No pilots match this filter.</p>}</div></>;
}
