type Option = { id: string; label: string };
type RouteValue = {
  id?: string; routeCode?: string | null; flightNumber?: string | null; callsign?: string | null;
  departureAirportId?: string | null; arrivalAirportId?: string | null; defaultFleetId?: string | null;
  scheduledDurationMinutes?: number | null; cruiseAltitude?: number | null; route?: string | null;
  networkPolicy?: string | null; effectiveFrom?: Date | null; effectiveUntil?: Date | null; internalNotes?: string | null;
};
const date = (value?: Date | null) => value ? value.toISOString().slice(0, 10) : "";
export function RouteForm({ action, route, airports, fleets, submitLabel }: { action: (form: FormData) => void | Promise<void>; route?: RouteValue; airports: Option[]; fleets: Option[]; submitLabel: string }) {
  return <form action={action} className="card">
    {route?.id && <input type="hidden" name="id" value={route.id}/>}
    <div className="form-grid">
      <label>Route code<input name="routeCode" required defaultValue={route?.routeCode ?? ""}/></label>
      <label>Commercial flight number<input name="flightNumber" defaultValue={route?.flightNumber ?? ""}/></label>
      <label>Default callsign<input name="callsign" defaultValue={route?.callsign ?? ""}/></label>
      <label>Departure airport<select name="departureAirportId" required defaultValue={route?.departureAirportId ?? ""}><option value="">Select airport</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Arrival airport<select name="arrivalAirportId" required defaultValue={route?.arrivalAirportId ?? ""}><option value="">Select airport</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Default fleet<select name="defaultFleetId" defaultValue={route?.defaultFleetId ?? ""}><option value="">No default fleet</option>{fleets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Estimated duration (minutes)<input name="durationMinutes" type="number" min="1" max="1440" defaultValue={route?.scheduledDurationMinutes ?? ""}/></label>
      <label>Default altitude (ft)<input name="cruiseAltitude" type="number" min="0" defaultValue={route?.cruiseAltitude ?? ""}/></label>
      <label>Effective from<input name="effectiveFrom" type="date" defaultValue={date(route?.effectiveFrom)}/></label>
      <label>Effective until<input name="effectiveUntil" type="date" defaultValue={date(route?.effectiveUntil)}/></label>
      <label>Network policy<input name="networkPolicy" defaultValue={route?.networkPolicy ?? ""}/></label>
      <label>Default route string<input name="route" defaultValue={route?.route ?? ""}/></label>
    </div>
    <label>Operational notes<textarea name="internalNotes" defaultValue={route?.internalNotes ?? ""}/></label>
    <div className="notice">Possible duplicates are blocked. Authorized Staff may confirm a justified exception below; no existing record is overwritten.</div>
    <div className="form-grid"><label><input type="checkbox" name="overrideConflicts" value="yes"/> Confirm conflict warning override</label><label>Override reason<input name="overrideReason"/></label></div>
    <div className="button-row"><button className="button">{submitLabel}</button></div>
  </form>;
}
