import {PageHeading} from "@/components/page-heading";
import {prisma} from "@/lib/prisma";
import {DEFAULT_SCORING_RULES,mergeScoringRules} from "@/lib/pirep/scoring";
import {saveScoringPolicy} from "./actions";

export const dynamic="force-dynamic";

export default async function Page({searchParams}:{searchParams:Promise<{fleet?:string;saved?:string;error?:string}>}){
  const q=await searchParams;
  const [fleets,policies]=await Promise.all([
    prisma.fleet.findMany({where:{active:true,archivedAt:null},select:{id:true,code:true,name:true,type:true},orderBy:{code:"asc"}}),
    prisma.pirepScoringPolicy.findMany({where:{active:true},orderBy:{scopeKey:"asc"}}),
  ]);
  const fleetId=q.fleet||"";
  const ownPolicy=policies.find(policy=>policy.scopeKey===(fleetId?`FLEET:${fleetId}`:"GLOBAL"));
  const globalPolicy=policies.find(policy=>policy.scopeKey==="GLOBAL");
  const effectivePolicy=ownPolicy??globalPolicy;
  const rules=mergeScoringRules(effectivePolicy?.rules);
  const selected=fleets.find(fleet=>fleet.id===fleetId);
  const groups=[...new Set(DEFAULT_SCORING_RULES.map(rule=>rule.group))];
  return <>
    <style>{`.scoring-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:18px;margin:18px 0}.scoring-group{padding:0;overflow:hidden}.scoring-group h2{padding:18px 20px;margin:0;border-bottom:1px solid var(--line)}.scoring-group table{margin:0}.scoring-rule-condition{max-width:330px}.scoring-status{display:inline-block;font-size:11px;font-weight:700;padding:4px 8px;border-radius:999px;margin-top:6px}.scoring-status.active{background:#d9f7e8;color:#08734b}.scoring-status.planned{background:#fff1c7;color:#8b5d00}`}</style>
    <PageHeading eyebrow="FLIGHT OPERATIONS" title="PIREP Scoring Rules" copy="Configure bonuses, deductions and integrity actions globally or for each fleet."/>
    {q.saved&&<div className="feedback success">Scoring policy version {q.saved} saved.</div>}
    {q.error&&<div className="feedback error">Operational and Efficiency weights must total 100.</div>}
    <section className="card"><form method="get" className="filter-row"><label>Fleet policy <select name="fleet" defaultValue={fleetId}><option value="">Global default</option>{fleets.map(fleet=><option key={fleet.id} value={fleet.id}>{fleet.code||fleet.type||fleet.name||fleet.id}</option>)}</select></label><button className="button secondary">Open policy</button></form><p className="meta">{fleetId&&!ownPolicy?"This fleet currently inherits the global policy. Saving creates its own override.":"Fleet policies override the global default."} Existing PIREPs retain their saved scoring snapshot.</p></section>
    <form action={saveScoringPolicy} className="route-form">
      <input type="hidden" name="fleetId" value={fleetId}/><input type="hidden" name="fleetName" value={selected?.code||selected?.name||""}/>
      <section className="card"><div className="route-form-grid"><label>Starting score<input name="startingScore" type="number" min="0" max="100" defaultValue={effectivePolicy?.startingScore??100}/></label><label>Operational weight %<input name="operationalWeight" type="number" min="0" max="100" defaultValue={effectivePolicy?.operationalWeight??70}/></label><label>Efficiency weight %<input name="efficiencyWeight" type="number" min="0" max="100" defaultValue={effectivePolicy?.efficiencyWeight??30}/></label><div><strong>{ownPolicy?`Version ${ownPolicy.version}`:fleetId?"Inherited from global":effectivePolicy?`Version ${effectivePolicy.version}`:"Built-in defaults"}</strong><p className="meta">{selected?`Fleet: ${selected.code||selected.name}`:"All fleets"}</p></div></div></section>
      <div className="scoring-groups">{groups.map(group=><section className="card scoring-group" key={group}><h2>{group}</h2><div className="table-wrapper"><table><thead><tr><th>Use</th><th>Condition</th><th>Action</th><th>Points</th></tr></thead><tbody>{rules.filter(rule=>rule.group===group).map(rule=><tr key={rule.code}><td><input type="checkbox" name={`enabled:${rule.code}`} defaultChecked={rule.enabled} disabled={rule.availability==="PLANNED"}/></td><td className="scoring-rule-condition"><strong>{rule.label}</strong><div className="meta">{rule.condition}</div><span className={`scoring-status ${rule.availability.toLowerCase()}`}>{rule.availability==="ACTIVE"?"ACARS DATA READY":"DATA SOURCE PLANNED"}</span></td><td><select name={`action:${rule.code}`} defaultValue={rule.action}><option>ADD</option><option>DEDUCT</option><option>REVIEW</option><option>INVALIDATE</option><option>NONE</option></select></td><td><input name={`points:${rule.code}`} type="number" min="0" max="100" defaultValue={rule.points}/></td></tr>)}</tbody></table></div></section>)}</div>
      <section className="card"><p className="meta">Rules marked DATA SOURCE PLANNED remain disabled until ACARS can measure them reliably.</p><button className="button">Save scoring policy</button></section>
    </form>
  </>;
}
