"use client";

import { useMemo, useState } from "react";
import { maintenanceAction, setAircraftLocationAction } from "@/app/staff/fleet/actions";
import { Badge, DataTable } from "@/components/data-table";

type Row = {
  vamsysAircraftId: string; registration: string | null; aircraftType: string | null;
  currentAirportIcao: string | null; locationStatus: string | null; source: string | null;
  lastPirep: string | null; updatedAt: string | null; conditionPercent: number | null;
  operationalStatus: string | null; maintenanceStatus: string | null;
  orderId: string | null; orderStatus: string | null;
};

export function UnifiedFleetConditionTable({ rows, labels }: { rows: Row[]; labels: Record<string, string> }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? rows.filter((row) => [row.registration, row.aircraftType, row.currentAirportIcao, row.locationStatus, row.operationalStatus, row.maintenanceStatus].some((value) => value?.toLowerCase().includes(query))) : rows;
  }, [rows, search]);

  return <section className="card fleet-condition-table">
    <div className="card-header"><h2>{labels.title}</h2><span className="meta">{filtered.length}/{rows.length}</span></div>
    <div className="fleet-search-bar"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} aria-label={labels.search}/>{search && <button className="action-button" type="button" onClick={() => setSearch("")}>{labels.clear}</button>}</div>
    <DataTable
      headers={[labels.registration, labels.type, labels.airport, labels.locationStatus, labels.condition, labels.operationalStatus, labels.maintenanceStatus, labels.source, labels.lastPirep, labels.updated, labels.actions]}
      rows={filtered.map((row) => {
        const percentage = row.conditionPercent;
        const color = percentage == null ? "#94a3b8" : percentage >= 80 ? "#16a34a" : percentage >= 60 ? "#84cc16" : percentage >= 40 ? "#f59e0b" : percentage >= 20 ? "#dc2626" : "#7f1d1d";
        const canMove = !["RESERVED", "IN_FLIGHT"].includes(row.locationStatus ?? "");
        const actions = <div key="actions" className="offer-actions">
          {canMove ? <details>
            <summary className="action-button approve">Mover aeronave</summary>
            <form action={setAircraftLocationAction} className="offer-actions">
              <input type="hidden" name="vamsysAircraftId" value={row.vamsysAircraftId}/>
              <input type="hidden" name="status" value="AVAILABLE"/>
              <input name="airportIcao" placeholder="Destino ICAO" maxLength={4} required className="condition-input"/>
              <input name="notes" placeholder="Motivo" required/>
              <button className="action-button approve">Confirmar</button>
            </form>
          </details> : <span className="meta">Movimiento bloqueado</span>}
          {row.operationalStatus === "FERRY_ONLY" && <a className="action-button approve" href={`/staff/flight-offers?type=MAINTENANCE_FERRY&aircraftId=${row.vamsysAircraftId}&departure=${row.currentAirportIcao ?? ""}&arrival=LEVC`}>{labels.ferry}</a>}
          {row.orderId && row.orderStatus !== "IN_PROGRESS" && <form action={maintenanceAction}><input type="hidden" name="action" value="start"/><input type="hidden" name="aircraftId" value={row.vamsysAircraftId}/><input type="hidden" name="orderId" value={row.orderId}/><button className="action-button">{labels.start}</button></form>}
          {row.orderId && row.orderStatus === "IN_PROGRESS" && <form action={maintenanceAction}><input type="hidden" name="action" value="complete"/><input type="hidden" name="aircraftId" value={row.vamsysAircraftId}/><input type="hidden" name="orderId" value={row.orderId}/><button className="action-button approve">{labels.complete}</button></form>}
          <form action={maintenanceAction}><input type="hidden" name="action" value="aog"/><input type="hidden" name="aircraftId" value={row.vamsysAircraftId}/><button className="action-button reject">{labels.setAog}</button></form>
          <form action={maintenanceAction}><input type="hidden" name="action" value="manual"/><input type="hidden" name="aircraftId" value={row.vamsysAircraftId}/><input name="condition" type="number" min="0" max="100" defaultValue={percentage ?? 100} className="condition-input"/><button className="action-button">{percentage == null ? labels.initialize : labels.manual}</button></form>
        </div>;
        return [
          row.registration ?? row.vamsysAircraftId,
          row.aircraftType ?? "—",
          row.currentAirportIcao ?? "—",
          row.locationStatus ?? "—",
          percentage == null ? <Badge key="condition">{labels.notInitialized}</Badge> : <div key="condition"><strong>{percentage}%</strong><div className="condition-track"><div style={{ width: `${percentage}%`, background: color }}/></div></div>,
          <Badge key="operational" tone={["AOG", "FERRY_ONLY"].includes(row.operationalStatus ?? "") ? "red" : row.operationalStatus === "MAINT_REQUIRED" ? "amber" : "green"}>{row.operationalStatus ?? "—"}</Badge>,
          row.maintenanceStatus ?? "—", row.source ?? "—", row.lastPirep ?? "—",
          row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—", actions,
        ];
      })}
    />
  </section>;
}
