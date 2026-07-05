"use client";

import { useMemo, useState } from "react";
import { Badge, DataTable } from "@/components/data-table";

type AircraftRow = {
  id: string;
  registration: string;
  aircraftType: string | null;
  airport: string | null;
  availability: string;
  conditionPercent: number | null;
  operationalStatus: string | null;
};

type Labels = {
  title: string;
  search: string;
  clear: string;
  registration: string;
  type: string;
  airport: string;
  availability: string;
  condition: string;
  operationalStatus: string;
  empty: string;
  notInitialized: string;
  statusValues: Record<string, string>;
};

export function PilotFleetList({ rows, labels }: { rows: AircraftRow[]; labels: Labels }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.registration, row.aircraftType, row.airport, row.availability, row.operationalStatus]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [rows, search]);

  return <section className="card pilot-fleet-list">
    <div className="card-header">
      <h2>{labels.title}</h2>
      <span className="meta">{filtered.length}/{rows.length}</span>
    </div>
    <div className="fleet-search-bar">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} aria-label={labels.search} />
      {search && <button type="button" className="action-button" onClick={() => setSearch("")}>{labels.clear}</button>}
    </div>
    {filtered.length === 0 ? <div className="empty-state">{labels.empty}</div> : <DataTable
      headers={[labels.registration, labels.type, labels.airport, labels.availability, labels.condition, labels.operationalStatus]}
      rows={filtered.map((row) => {
        const condition = row.conditionPercent;
        const conditionTone = condition == null ? undefined : condition >= 60 ? "green" : condition >= 30 ? "amber" : "red";
        const availabilityTone = row.availability === "AVAILABLE" ? "green" : row.availability === "MAINTENANCE" ? "red" : "amber";
        const operationalTone = ["AOG", "FERRY_ONLY"].includes(row.operationalStatus ?? "") ? "red" : row.operationalStatus === "MAINT_REQUIRED" ? "amber" : "green";
        return [
          <strong key="registration">{row.registration}</strong>,
          row.aircraftType ?? "—",
          row.airport ?? "—",
          <Badge key="availability" tone={availabilityTone}>{labels.statusValues[row.availability] ?? row.availability}</Badge>,
          <Badge key="condition" tone={conditionTone}>{condition == null ? labels.notInitialized : `${condition}%`}</Badge>,
          <Badge key="operational" tone={operationalTone}>{row.operationalStatus ?? "—"}</Badge>,
        ];
      })}
    />}
  </section>;
}
