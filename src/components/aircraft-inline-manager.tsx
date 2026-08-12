"use client";

import { useState } from "react";
import { hubsAction, locationAction, statusAction } from "@/app/staff/aircraft/actions";

type Airport = { id: string; icao: string; name: string | null };
type BaseProps = { aircraftId: string; returnTo: string; canManage: boolean };
const statuses = ["AVAILABLE","RESERVED","DISPATCHED","IN_FLIGHT","TURNAROUND","MAINTENANCE","FERRY_ONLY","AOG","SUSPENDED","RETIRED","UNKNOWN"];
const Hidden = ({ aircraftId, returnTo }: Pick<BaseProps,"aircraftId"|"returnTo">) => <><input type="hidden" name="id" value={aircraftId}/><input type="hidden" name="returnTo" value={returnTo}/></>;

export function InlineHubs({ aircraftId, returnTo, canManage, airports, hubs }: BaseProps & { airports: Airport[]; hubs: Array<{ airportId: string; airport: { icao: string } }> }) {
  const [editing, setEditing] = useState(false);
  const label = hubs.length ? hubs.map(({ airport }) => airport.icao).join(" · ") : "Unrestricted";
  if (!canManage || !editing) return <button className="aircraft-inline-value" type="button" disabled={!canManage} onClick={() => setEditing(true)}>{label}</button>;
  return <form action={hubsAction} className="aircraft-inline-editor"><Hidden aircraftId={aircraftId} returnTo={returnTo}/><select name="hubAirportIds" multiple size={5} defaultValue={hubs.map(({ airportId }) => airportId)}>{airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.icao} · {airport.name ?? "Unnamed"}</option>)}</select><div><button className="button">Save</button><button type="button" className="button secondary" onClick={() => setEditing(false)}>Cancel</button></div></form>;
}

export function InlineLocation({ aircraftId, returnTo, canManage, airports, airportId, label, status }: BaseProps & { airports: Airport[]; airportId: string | null; label: string; status: string }) {
  const [editing, setEditing] = useState(false);
  if (!canManage || !editing) return <button className="aircraft-inline-value" type="button" disabled={!canManage} onClick={() => setEditing(true)}>{label}</button>;
  return <form action={locationAction} className="aircraft-inline-editor"><Hidden aircraftId={aircraftId} returnTo={returnTo}/><input type="hidden" name="status" value={status}/><select name="airportId" defaultValue={airportId ?? ""}><option value="">Unknown</option>{airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.icao} · {airport.name ?? "Unnamed"}</option>)}</select><input name="reason" required placeholder="Reason"/><div><button className="button">Save</button><button type="button" className="button secondary" onClick={() => setEditing(false)}>Cancel</button></div></form>;
}

export function InlineStatus({ aircraftId, returnTo, canManage, status }: BaseProps & { status: string }) {
  const [editing, setEditing] = useState(false);
  if (!canManage || !editing) return <button className="aircraft-inline-value badge" type="button" disabled={!canManage} onClick={() => setEditing(true)}>{status}</button>;
  return <form action={statusAction} className="aircraft-inline-editor"><Hidden aircraftId={aircraftId} returnTo={returnTo}/><select name="status" defaultValue={status}>{statuses.map((item) => <option key={item}>{item}</option>)}</select><input name="reason" required placeholder="Reason"/><div><button className="button">Save</button><button type="button" className="button secondary" onClick={() => setEditing(false)}>Cancel</button></div></form>;
}
