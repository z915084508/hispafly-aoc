"use client";
import { useState } from "react";
import type { OperationalEvent } from "@prisma/client";
const time = (x: Date | string | null) => x ? new Date(x).toLocaleTimeString("en-GB", { timeZone: "UTC" }) : "—";
const words = (x: string) => x.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toUpperCase();
const metadata = (e: OperationalEvent) => e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata)
  ? e.metadata as Record<string, unknown> : {};
const isFoqa = (e: OperationalEvent) => e.source === "ACARS_FOQA";
const foqa = (e: OperationalEvent) => isFoqa(e) ? words(e.eventType) : "—";
const reason = (e: OperationalEvent) => {
  const m = metadata(e);
  const eventName = typeof m.eventName === "string" ? m.eventName : null;
  const message = typeof m.message === "string" ? m.message : null;
  return (eventName ?? message)?.trim().toUpperCase() || words(e.eventType);
};
const filters = ["ALL", "FOQA", "SCORED", "INFO", "REVIEW", "DATA QUALITY"] as const;
export function OperationalEventsTimeline({ events, dispositionAction }: { events: OperationalEvent[]; dispositionAction?: (eventId: string, form: FormData) => Promise<void> }) {
  const [filter, setFilter] = useState<string>("ALL");
  const sorted = [...events].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const shown = sorted.filter(e => filter === "ALL" || filter === "FOQA" && (e.source === "ACARS_FOQA" || e.scoreEligible) || filter === "SCORED" && e.scoreImpact !== 0 || filter === "INFO" && e.severity === "INFO" || filter === "REVIEW" && e.requiresReview || filter === "DATA QUALITY" && e.status === "DATA_QUALITY");
  return <div className="operational-events-timeline">
    <p>{events.length} Events · {events.filter(e => e.scoreImpact !== 0).length} Scored · {events.filter(e => e.severity === "INFO").length} Info · {events.filter(e => e.requiresReview).length} Review · {events.filter(e => e.status === "DATA_QUALITY").length} Data Quality</p>
    <div role="group" aria-label="Operational log filters" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>{filters.map(x => <button key={x} type="button" aria-pressed={filter === x} onClick={() => setFilter(x)}>{x}</button>)}</div>
    <p className="meta">All times UTC. Open an event to inspect evidence and disposition.</p>
    <div style={{ overflowX: "auto" }}><table className="data-table" style={{ width: "100%" }}><thead><tr>{["TIME", "FOQA", "SEVERITY", "EVENT", "SCORE"].map(x => <th key={x}>{x}</th>)}</tr></thead>
      <tbody>{shown.map(e => <tr key={e.id}>
        <td>{time(e.timestamp)}</td><td>{foqa(e)}</td><td>{e.status !== "CONFIRMED" ? e.status : e.severity}{e.requiresReview ? " · REVIEW" : ""}</td>
        <td><details><summary>{reason(e)}</summary>
          <dl>{Object.entries({ Status: e.status, "Rule code": e.ruleCode, "Episode ID": e.episodeId, Start: time(e.startedAt), Confirmed: time(e.confirmedAt), End: time(e.endedAt), Threshold: e.threshold, "Start value": e.value, "Peak value": e.peakValue, "End value": e.endValue, Confidence: e.confidence, "Original impact": e.originalImpact, "Current impact": e.scoreImpact, "Staff reason": e.dispositionReason, Reviewer: e.reviewedByName, "Reviewed at": e.reviewedAt ? new Date(e.reviewedAt).toISOString() : null }).map(([k,v]) => <div key={k}><dt style={{ display: "inline", fontWeight: 600 }}>{k}: </dt><dd style={{ display: "inline", margin: 0 }}>{v ?? "—"}</dd></div>)}</dl>
          <details><summary>Normalized telemetry, raw telemetry and diagnostics</summary><pre style={{ whiteSpace: "pre-wrap", maxWidth: 700, overflowWrap: "anywhere" }}>{JSON.stringify({ aircraftSnapshot: e.aircraftSnapshot, metadata: e.metadata }, null, 2)}</pre></details>
          {dispositionAction && <form action={dispositionAction.bind(null, e.id)} style={{ display: "grid", gap: 8, padding: "12px 0" }}>
            <label>Staff disposition <select name="status" defaultValue={e.status}>{["CONFIRMED", "DISMISSED", "SUPPRESSED", "DATA_QUALITY"].map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Reason <textarea name="reason" required maxLength={2000} /></label><button type="submit">Save disposition and recalculate</button>
          </form>}
        </details></td><td>{e.scoreImpact > 0 ? "+" : ""}{e.scoreImpact}</td>
      </tr>)}</tbody></table></div>{!shown.length && <p className="meta">No events match this filter.</p>}
  </div>;
}
