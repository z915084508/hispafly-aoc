"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { AircraftLocationMapItem, AircraftLocationSourceValue, AircraftLocationStatusValue, FleetMapLabels } from "./types";

const StaffFleetMap = dynamic(() => import("./staff-fleet-map"), { ssr: false, loading: () => <div className="fleet-map-loading" /> });
const STALE_MS = 72 * 60 * 60 * 1000;
const isStale = (item: AircraftLocationMapItem) => Date.now() - new Date(item.updatedAt).getTime() > STALE_MS;
const repositionUrl = (item: AircraftLocationMapItem) => `/staff/flight-offers?${new URLSearchParams({ type: "AIRCRAFT_REPOSITION", aircraftId: item.vamsysAircraftId, departure: item.currentAirportIcao ?? "", aircraftRegistration: item.registration ?? "", aircraftType: item.aircraftType ?? "" })}`;

type ExplorerLabels = FleetMapLabels & {
  mapTitle: string; filters: string; all: string; statusFilter: string; typeFilter: string; airportFilter: string; sourceFilter: string;
  onlyAvailable: string; onlyExternal: string; onlyNoCoordinates: string; onlyStale: string; coordinates: string; coordinatesOk: string; noCoordinates: string; actions: string;
};

export function StaffFleetExplorer({ aircraft, labels, locale }: { aircraft: AircraftLocationMapItem[]; labels: ExplorerLabels; locale: string }) {
  const [status, setStatus] = useState(""); const [type, setType] = useState(""); const [airport, setAirport] = useState(""); const [source, setSource] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false); const [onlyExternal, setOnlyExternal] = useState(false); const [onlyNoCoordinates, setOnlyNoCoordinates] = useState(false); const [onlyStale, setOnlyStale] = useState(false);
  const types = useMemo(() => [...new Set(aircraft.map((item) => item.aircraftType).filter(Boolean) as string[])].sort(), [aircraft]);
  const airports = useMemo(() => [...new Set(aircraft.map((item) => item.currentAirportIcao).filter(Boolean) as string[])].sort(), [aircraft]);
  const filtered = useMemo(() => aircraft.filter((item) => (!status || item.status === status) && (!type || item.aircraftType === type) && (!airport || item.currentAirportIcao === airport) && (!source || item.source === source) && (!onlyAvailable || item.status === "AVAILABLE") && (!onlyExternal || item.source === "VAMSYS_EXTERNAL") && (!onlyNoCoordinates || item.latitude === null || item.longitude === null) && (!onlyStale || isStale(item))), [aircraft, status, type, airport, source, onlyAvailable, onlyExternal, onlyNoCoordinates, onlyStale]);
  const mapLabels: FleetMapLabels = labels;
  return <>
    <section className="card fleet-filters"><div className="card-header"><h2 className="card-title">{labels.filters}</h2><span className="meta">{filtered.length}/{aircraft.length}</span></div><div className="fleet-filter-grid">
      <label>{labels.statusFilter}<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{labels.all}</option>{Object.entries(labels.statusValues).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>{labels.typeFilter}<select value={type} onChange={(e) => setType(e.target.value)}><option value="">{labels.all}</option>{types.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>{labels.airportFilter}<select value={airport} onChange={(e) => setAirport(e.target.value)}><option value="">{labels.all}</option>{airports.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>{labels.sourceFilter}<select value={source} onChange={(e) => setSource(e.target.value)}><option value="">{labels.all}</option>{Object.entries(labels.sourceValues).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    </div><div className="fleet-filter-toggles">{[[onlyAvailable, setOnlyAvailable, labels.onlyAvailable], [onlyExternal, setOnlyExternal, labels.onlyExternal], [onlyNoCoordinates, setOnlyNoCoordinates, labels.onlyNoCoordinates], [onlyStale, setOnlyStale, labels.onlyStale]].map(([checked, setter, label]) => <label key={String(label)}><input type="checkbox" checked={checked as boolean} onChange={(e) => (setter as (value: boolean) => void)(e.target.checked)} />{String(label)}</label>)}</div></section>
    <section className="card fleet-map-card"><div className="card-header"><h2 className="card-title">{labels.mapTitle}</h2><span className="meta">© OpenStreetMap contributors</span></div><StaffFleetMap aircraft={filtered} labels={mapLabels} locale={locale} /></section>
    <section className="card fleet-table-card"><div className="table-wrap"><table><thead><tr>{[labels.registration, labels.aircraftType, labels.airportFilter, labels.status, labels.source, labels.lastBooking, labels.lastPirep, labels.updatedAt, labels.coordinates, labels.actions].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{filtered.map((item) => {
      const canReposition = item.status === "AVAILABLE" && Boolean(item.currentAirportIcao); const stale = isStale(item);
      return <tr key={item.id}><td><strong>{item.registration ?? item.vamsysAircraftId}</strong>{stale && <span className="badge red fleet-inline-badge">{labels.staleLocation}</span>}</td><td>{item.aircraftType ?? "—"}</td><td>{item.currentAirportIcao ?? "—"}</td><td><span className={`badge ${item.status === "AVAILABLE" ? "" : item.status === "RESERVED" ? "amber" : item.status === "MAINTENANCE" || item.status === "UNKNOWN" ? "red" : "blue"}`}>{labels.statusValues[item.status]}</span></td><td>{item.source === "VAMSYS_EXTERNAL" ? <span className="badge amber">{labels.externalMovement}</span> : labels.sourceValues[item.source]}</td><td>{item.lastBookingId ?? "—"}</td><td>{item.lastVamsysPirepId ?? "—"}</td><td>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updatedAt))}</td><td><span className={`badge ${item.latitude === null || item.longitude === null ? "red" : ""}`}>{item.latitude === null || item.longitude === null ? labels.noCoordinates : labels.coordinatesOk}</span></td><td>{canReposition ? <a className="action-button approve" href={repositionUrl(item)}>{labels.createRepositionOffer}</a> : <button className="action-button" disabled title={labels.unavailable}>{labels.createRepositionOffer}</button>}</td></tr>;
    })}</tbody></table></div></section>
  </>;
}
