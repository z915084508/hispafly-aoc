"use client";

import { useState } from "react";
import { updatePilotHubInlineAction, updatePilotLocationInlineAction } from "@/app/staff/pilots/inline-actions";

type Airport = { id: string; icao: string; name: string | null };
type Props = { pilotId: string; returnTo: string; canManage: boolean; airports: Airport[] };
const Hidden = ({ pilotId, returnTo }: Pick<Props, "pilotId" | "returnTo">) => <><input type="hidden" name="id" value={pilotId}/><input type="hidden" name="returnTo" value={returnTo}/></>;

export function InlinePilotHub({ pilotId, returnTo, canManage, airports, hub }: Props & { hub: string | null }) {
  const [editing, setEditing] = useState(false);
  const validHub = airports.some((airport) => airport.icao === hub) ? hub : null;
  if (!canManage || !editing) return <button className="aircraft-inline-value" type="button" disabled={!canManage} onClick={() => setEditing(true)}>{validHub ?? "Not set"}</button>;
  return <form action={updatePilotHubInlineAction} className="aircraft-inline-editor"><Hidden pilotId={pilotId} returnTo={returnTo}/><select name="hubId" required defaultValue={validHub ?? ""}><option value="" disabled>Select HUB</option>{airports.map((airport) => <option key={airport.id} value={airport.icao}>{airport.icao} · {airport.name ?? "HISPAFLY HUB"}</option>)}</select><div><button className="button">Save</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div></form>;
}

export function InlinePilotLocation({ pilotId, returnTo, canManage, airports, airportId, label }: Props & { airportId: string | null; label: string }) {
  const [editing, setEditing] = useState(false);
  if (!canManage || !editing) return <button className="aircraft-inline-value" type="button" disabled={!canManage} onClick={() => setEditing(true)}>{label}</button>;
  return <form action={updatePilotLocationInlineAction} className="aircraft-inline-editor"><Hidden pilotId={pilotId} returnTo={returnTo}/><select name="airportId" required defaultValue={airportId ?? ""}><option value="" disabled>Select location</option>{airports.map((airport) => <option key={airport.id} value={airport.id}>{airport.icao} · {airport.name ?? "Unnamed"}</option>)}</select><div><button className="button">Save</button><button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div></form>;
}
