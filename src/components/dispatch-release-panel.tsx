import { Badge } from "@/components/data-table";
import { dispatchReleaseItems, dispatchReleaseMessages } from "@/lib/dispatch-release/view";

interface ReleaseRecord { status: string; riskLevel: string; checks: unknown; warnings: unknown; blockingItems: unknown; updatedAt: Date; }
const tone = (status: string) => status === "OK" || status === "READY" || status === "SIGNED" || status === "LOW" ? "green" as const : status === "BLOCKED" || status === "HIGH" ? "red" as const : "amber" as const;

export function DispatchReleasePanel({ release }: { release: ReleaseRecord | null }) {
  if (!release) return <section className="card"><div className="card-header"><h2 className="card-title">HISPAFLY Dispatch Release</h2><Badge tone="amber">PENDING</Badge></div><div className="notice">Generate the SimBrief OFP to create the Dispatch Release checklist.</div></section>;
  const items = dispatchReleaseItems(release.checks), warnings = dispatchReleaseMessages(release.warnings), blocking = dispatchReleaseMessages(release.blockingItems);
  return <section className="card">
    <div className="card-header"><div><h2 className="card-title">HISPAFLY Dispatch Release</h2><span className="meta">Updated {release.updatedAt.toISOString()}</span></div><div className="inline-action-form"><Badge tone={tone(release.status)}>{release.status}</Badge><Badge tone={tone(release.riskLevel)}>RISK {release.riskLevel}</Badge></div></div>
    <div className="table-wrapper"><table><thead><tr><th>Checklist item</th><th>Status</th><th>Details</th></tr></thead><tbody>{items.map((item) => <tr key={item.key}><td>{item.label}</td><td><Badge tone={tone(item.status)}>{item.status}</Badge></td><td>{item.detail}</td></tr>)}</tbody></table></div>
    {warnings.length > 0 && <div className="notice"><strong>Warnings</strong><ul>{warnings.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    {blocking.length > 0 && <div className="feedback error"><strong>Blocking items</strong><ul>{blocking.map((item) => <li key={item}>{item}</li>)}</ul></div>}
  </section>;
}

