import { SubmitButton } from "@/components/submit-button";

type Airport = { icao: string; name: string | null };
type Fleet = { id: string; vamsysFleetId: string | null; name: string | null };
type RouteValue = { id?: string; type?: string; callsign?: string | null; flightNumber?: string | null; departure?: string; arrival?: string; route?: string | null; scheduledDurationMinutes?: number | null; distanceNm?: number | null; cruiseAltitude?: number | null; costIndex?: number | null; operationalStatus?: string; internalNotes?: string | null; fleetAssignments?: { fleetId: string }[] };

export function RouteForm({ action, airports, fleets, value }: { action: (formData: FormData) => void | Promise<void>; airports: Airport[]; fleets: Fleet[]; value?: RouteValue }) {
  const selected = new Set(value?.fleetAssignments?.map(item => item.fleetId));
  return <form action={action} className="route-form">
    {value?.id && <input type="hidden" name="id" value={value.id}/>}<input type="hidden" name="type" value={value?.type ?? "scheduled"}/>
    <fieldset><legend><span>01</span>Route identity</legend><p className="route-form-help">Official vAMSYS identifiers and airport pair.</p><div className="route-form-grid">
      <label>Flight number<input name="flightNumber" required defaultValue={value?.flightNumber ?? ""} placeholder="HF123"/><small>IATA format · 3–6 characters</small></label>
      <label>Callsign<input name="callsign" required defaultValue={value?.callsign ?? ""} placeholder="HPF123"/><small>ICAO format · 4–7 characters</small></label>
      <label>Departure<select name="departureIcao" required defaultValue={value?.departure ?? ""} disabled={Boolean(value?.id)}><option value="">Select departure airport</option>{airports.map(a=><option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}</select>{value?.id && <input type="hidden" name="departureIcao" value={value.departure}/>}<small>{value?.id ? "Locked after publication" : "Synchronized vAMSYS airport"}</small></label>
      <label>Arrival<select name="arrivalIcao" required defaultValue={value?.arrival ?? ""} disabled={Boolean(value?.id)}><option value="">Select arrival airport</option>{airports.map(a=><option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}</select>{value?.id && <input type="hidden" name="arrivalIcao" value={value.arrival}/>}<small>{value?.id ? "Locked after publication" : "Must differ from departure"}</small></label>
    </div></fieldset>
    <fieldset><legend><span>02</span>Schedule and performance</legend><p className="route-form-help">All times are UTC. Distance is expressed in nautical miles.</p><div className="route-form-grid route-form-grid-3">
      <label>Departure UTC<input name="departureTime" type="time" step="1"/></label><label>Arrival UTC<input name="arrivalTime" type="time" step="1"/></label>
      <label>Duration<input name="durationMinutes" type="number" min="1" defaultValue={value?.scheduledDurationMinutes ?? ""} placeholder="255"/><small>Minutes</small></label>
      <label>Distance<input name="distanceNm" type="number" min="1" defaultValue={value?.distanceNm ?? ""} placeholder="2145"/><small>Nautical miles</small></label>
      <label>Altitude<input name="altitude" type="number" min="0" defaultValue={value?.cruiseAltitude ?? ""} placeholder="36000"/><small>Feet</small></label>
      <label>Cost index<input name="costIndex" defaultValue={value?.costIndex ?? ""} placeholder="AUTO or 0–999"/></label>
    </div></fieldset>
    <fieldset><legend><span>03</span>Fleet and routing</legend><p className="route-form-help">Choose one or more synchronized fleets. Use Ctrl/Cmd to select multiple entries.</p><div className="route-form-grid">
      <label className="route-fleet-field">Permitted fleets<select name="fleetIds" multiple required size={Math.min(6, Math.max(3, fleets.length))} defaultValue={[...selected]}>{fleets.filter(f=>f.vamsysFleetId).map(f=><option key={f.id} value={f.id}>{f.name ?? `Fleet ${f.vamsysFleetId}`}</option>)}</select><small>{fleets.filter(f=>f.vamsysFleetId).length} synchronized fleet types available</small></label>
      <label>Operational route<textarea name="route" defaultValue={value?.route ?? ""} placeholder="DCT KORRY Y353 TAFFY DCT"/><small>Route string published to vAMSYS</small></label>
      <label className="route-form-span-2">vAMSYS remarks<textarea name="remarks" placeholder="Visible operational remarks for this route"/></label>
    </div></fieldset>
    <fieldset className="route-internal-section"><legend><span>04</span>HISPAFLY internal</legend><div className="route-form-grid">
      <label className="route-form-span-2">Internal notes<textarea name="internalNotes" defaultValue={value?.internalNotes ?? ""} placeholder="Notes for HISPAFLY staff only"/><small className="field-note">Private AOC data · never sent to vAMSYS</small></label>
      <label className="route-toggle"><input name="hidden" type="checkbox" defaultChecked={value?.operationalStatus === "HIDDEN"}/><span><strong>Hidden in vAMSYS</strong><small>Keep the route synchronized but unavailable for normal operations.</small></span></label>
    </div></fieldset>
    <div className="route-form-submit"><div><strong>{value?.id ? "Publish route changes" : "Ready to publish"}</strong><span>vAMSYS will validate the route before accepting it.</span></div><SubmitButton className="button" pendingChildren="Publishing…">{value?.id ? "Update in vAMSYS" : "Publish to vAMSYS"}</SubmitButton></div>
  </form>;
}
