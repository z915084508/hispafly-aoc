import { SubmitButton } from "@/components/submit-button";

type Airport = { icao: string; name: string | null };
type Fleet = { id: string; vamsysFleetId: string; name: string | null };
type RouteValue = { id?: string; type?: string; callsign?: string | null; flightNumber?: string | null; departure?: string; arrival?: string; route?: string | null; scheduledDurationMinutes?: number | null; distanceNm?: number | null; cruiseAltitude?: number | null; costIndex?: number | null; operationalStatus?: string; internalNotes?: string | null; fleetAssignments?: { fleetId: string }[] };

export function RouteForm({ action, airports, fleets, value }: { action: (formData: FormData) => void | Promise<void>; airports: Airport[]; fleets: Fleet[]; value?: RouteValue }) {
  const selected = new Set(value?.fleetAssignments?.map(item => item.fleetId));
  return <form action={action} className="offer-form">
    {value?.id && <input type="hidden" name="id" value={value.id}/>}<input type="hidden" name="type" value={value?.type ?? "scheduled"}/>
    <label>Flight number<input name="flightNumber" required defaultValue={value?.flightNumber ?? ""}/></label>
    <label>Callsign<input name="callsign" required defaultValue={value?.callsign ?? ""}/></label>
    <label>Departure<select name="departureIcao" required defaultValue={value?.departure ?? ""} disabled={Boolean(value?.id)}><option value="">Select airport</option>{airports.map(a=><option key={a.icao} value={a.icao}>{a.icao} - {a.name}</option>)}</select>{value?.id && <input type="hidden" name="departureIcao" value={value.departure}/>}</label>
    <label>Arrival<select name="arrivalIcao" required defaultValue={value?.arrival ?? ""} disabled={Boolean(value?.id)}><option value="">Select airport</option>{airports.map(a=><option key={a.icao} value={a.icao}>{a.icao} - {a.name}</option>)}</select>{value?.id && <input type="hidden" name="arrivalIcao" value={value.arrival}/>}</label>
    <label>Departure UTC<input name="departureTime" type="time" step="1"/></label><label>Arrival UTC<input name="arrivalTime" type="time" step="1"/></label>
    <label>Duration (minutes)<input name="durationMinutes" type="number" min="1" defaultValue={value?.scheduledDurationMinutes ?? ""}/></label>
    <label>Distance (NM)<input name="distanceNm" type="number" min="1" defaultValue={value?.distanceNm ?? ""}/></label>
    <label>Altitude (ft)<input name="altitude" type="number" min="0" defaultValue={value?.cruiseAltitude ?? ""}/></label>
    <label>Cost index<input name="costIndex" defaultValue={value?.costIndex ?? ""} placeholder="AUTO or 0-999"/></label>
    <label className="wide">Permitted fleets<select name="fleetIds" multiple required defaultValue={[...selected]}>{fleets.map(f=><option key={f.id} value={f.id}>{f.name ?? f.vamsysFleetId}</option>)}</select></label>
    <label className="wide">vAMSYS route<textarea name="route" defaultValue={value?.route ?? ""}/></label>
    <label className="wide">vAMSYS remarks<textarea name="remarks"/></label>
    <label className="wide">HISPAFLY internal notes<textarea name="internalNotes" defaultValue={value?.internalNotes ?? ""}/><span className="field-note">Never sent to vAMSYS.</span></label>
    <label><input name="hidden" type="checkbox" defaultChecked={value?.operationalStatus === "HIDDEN"}/> Hidden in vAMSYS</label>
    <div><SubmitButton className="button" pendingChildren="Publishing…">{value?.id ? "Update in vAMSYS" : "Publish to vAMSYS"}</SubmitButton></div>
  </form>;
}
