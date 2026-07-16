import Link from "next/link";
import { getCutoverDashboard } from "@/lib/native-cutover/service";
import { refreshCutoverReviewQueueAction } from "./actions";

export default async function NativeCutoverDashboard() {
  const dashboard = await getCutoverDashboard();
  return <>
    <div className="page-header"><div><div className="eyebrow">TASK 5.7</div><h1>Native Cutover</h1><p>Measured readiness for independent HispaFly operations and ACARS.</p></div></div>
    <div className="workflow-summary">
      <div><span>Status</span><strong>{dashboard.status}</strong></div>
      <div><span>Native ready</span><strong>{dashboard.nativeReady}</strong></div>
      <div><span>Unresolved</span><strong>{dashboard.unresolved}</strong></div>
      <div><span>Invalid</span><strong>{dashboard.invalid}</strong></div>
      <div><span>ACARS contract</span><strong>{dashboard.acarsContractVersion}</strong></div>
    </div>
    <section className="card"><h2>Migration inventory</h2><table><thead><tr><th>Entity</th><th>Total</th><th>Native</th><th>Linked</th><th>Unresolved</th><th>Historical</th><th>Invalid</th></tr></thead><tbody>{dashboard.inventory.map((row) => <tr key={row.entityType}><td><Link href={`/staff/native-cutover/${row.entityType}`}>{row.entityType}</Link></td><td>{row.total}</td><td>{row.nativeReady}</td><td>{row.legacyLinked}</td><td>{row.legacyUnresolved}</td><td>{row.historicalOnly}</td><td>{row.invalid}</td></tr>)}</tbody></table></section>
    <section className="card"><h2>Runtime readiness</h2><p>{dashboard.runtimeDependencyAudit}<br/>{dashboard.environmentReadiness}<br/>E2E: {dashboard.endToEndStatus}</p><ul>{dashboard.disabledIntegrations.map((item) => <li key={item}>{item}: disabled</li>)}</ul></section>
    <form action={refreshCutoverReviewQueueAction}><button className="button secondary">Refresh review queue</button></form>
  </>;
}
