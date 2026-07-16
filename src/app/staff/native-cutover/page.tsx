import Link from "next/link";
import { getCutoverDashboard } from "@/lib/native-cutover/service";
import { refreshCutoverReviewQueueAction } from "./actions";

export default async function NativeCutoverDashboard({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [dashboard, query] = await Promise.all([getCutoverDashboard(), searchParams]);
  return <>
    <div className="page-header"><div><div className="eyebrow">TASK 5.7</div><h1>Native Cutover</h1><p>Measured readiness for independent HispaFly operations and ACARS.</p></div></div>
    <div className="workflow-summary">
      <div><span>Status</span><strong>{dashboard.status}</strong></div>
      <div><span>Native ready</span><strong>{dashboard.nativeReady}</strong></div>
      <div><span>Unresolved</span><strong>{dashboard.unresolved}</strong></div>
      <div><span>Invalid</span><strong>{dashboard.invalid}</strong></div>
      <div><span>ACARS contract</span><strong>{dashboard.acarsContractVersion}</strong></div>
    </div>
    {query.success && <div className="notice success">{query.success}</div>}
    {query.error && <div className="notice">{query.error}</div>}
    <section className="card">
      <h2>Pending manual review</h2>
      <p>Refreshing creates or updates the review queue. It does not change inventory counts or link records automatically.</p>
      {dashboard.queueGroups.length ? <div className="button-row">{dashboard.queueGroups.map((group) =>
        <Link className="button secondary" href={`/staff/native-cutover/${group.entityType}`} key={group.entityType}>
          Review {group.entityType} ({group.count})
        </Link>
      )}</div> : <p>No pending review items. Use Refresh review queue to scan the current database.</p>}
    </section>
    <section className="card"><h2>Migration inventory</h2><table><thead><tr><th>Entity</th><th>Total</th><th>Native</th><th>Linked</th><th>Unresolved</th><th>Historical</th><th>Invalid</th></tr></thead><tbody>{dashboard.inventory.map((row) => <tr key={row.entityType}><td><Link href={`/staff/native-cutover/${row.entityType}`}>{row.entityType}</Link></td><td>{row.total}</td><td>{row.nativeReady}</td><td>{row.legacyLinked}</td><td>{row.legacyUnresolved}</td><td>{row.historicalOnly}</td><td>{row.invalid}</td></tr>)}</tbody></table></section>
    <section className="card"><h2>Runtime readiness</h2><p>{dashboard.runtimeDependencyAudit}<br/>{dashboard.environmentReadiness}<br/>E2E: {dashboard.endToEndStatus}</p><ul>{dashboard.disabledIntegrations.map((item) => <li key={item}>{item}: disabled</li>)}</ul></section>
    <form action={refreshCutoverReviewQueueAction}><button className="button secondary">Refresh review queue</button></form>
  </>;
}
