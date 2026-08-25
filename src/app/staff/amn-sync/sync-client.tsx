"use client";

import { useState } from "react";

type SyncResult = {
  from: string;
  to: string;
  airports: { found: number; synced: number; skipped: number };
  routes: { found: number; synced: number; skipped: number };
  flights: { found: number; synced: number; cancelled: number; skipped: number };
  errors: Array<{ entity: string; id: string; message: string }>;
};

export default function AmnSyncClient() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSync() {
    setRunning(true);
    setError(null);
    setResult(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await fetch("/api/amn/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizonDays: 30 }),
        signal: controller.signal,
      });
      const body = await response.json() as { result?: SyncResult; error?: string };
      if (!response.ok && response.status !== 207) throw new Error(body.error || `Sync returned ${response.status}`);
      if (!body.result) throw new Error(body.error || "AMN sync returned no result.");
      setResult(body.result);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setError("Sync took longer than 55 seconds. It may have partially completed; wait a moment and run it again. Re-running is safe and idempotent.");
      } else {
        setError(caught instanceof Error ? caught.message : "AMN sync failed.");
      }
    } finally {
      window.clearTimeout(timeout);
      setRunning(false);
    }
  }

  return <>
    <div className="card">
      <h2>HISPAFLY → AMN Initial Sync</h2>
      <p>Synchronizes ACTIVE airports, ACTIVE routes and dated flights for the next 30 days. Re-running is idempotent.</p>
      <button className="button" type="button" onClick={runSync} disabled={running}>
        {running ? "Synchronizing…" : "Sync next 30 days"}
      </button>
      {running && <p><small>Sync is running with bounded concurrency. Large networks can still take several seconds.</small></p>}
    </div>
    {error && <div className="empty-state"><strong>Sync failed:</strong> {error}</div>}
    {result && <>
      <div className="stats-grid">
        <div className="stat-card"><span>Airports</span><strong>{result.airports.synced}/{result.airports.found}</strong><small>{result.airports.skipped} skipped</small></div>
        <div className="stat-card"><span>Routes</span><strong>{result.routes.synced}/{result.routes.found}</strong><small>{result.routes.skipped} skipped</small></div>
        <div className="stat-card"><span>Flights</span><strong>{result.flights.synced}/{result.flights.found}</strong><small>{result.flights.cancelled} cancelled · {result.flights.skipped} skipped</small></div>
      </div>
      <div className="card">
        <h3>Window</h3><p>{result.from} → {result.to}</p>
        <h3>Errors</h3>
        {result.errors.length === 0 ? <p>No synchronization errors.</p> : <div className="table-wrap"><table><thead><tr><th>Type</th><th>Record</th><th>Error</th></tr></thead><tbody>{result.errors.map((row, index) => <tr key={`${row.entity}-${row.id}-${index}`}><td>{row.entity}</td><td>{row.id}</td><td>{row.message}</td></tr>)}</tbody></table></div>}
      </div>
    </>}
  </>;
}
