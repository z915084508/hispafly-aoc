type Option = { id: string; label: string };
type RouteValue = {
  id?: string; routeCode?: string | null; flightNumber?: string | null; callsign?: string | null;
  departureAirportId?: string | null; arrivalAirportId?: string | null; defaultFleetId?: string | null;
  scheduledDurationMinutes?: number | null; cruiseAltitude?: number | null; route?: string | null;
  networkPolicy?: string | null; effectiveFrom?: Date | null; effectiveUntil?: Date | null; internalNotes?: string | null;
};
const date = (value?: Date | null) => value ? value.toISOString().slice(0, 10) : "";
export function RouteForm({ action, route, airports, fleets, submitLabel }: { action: (form: FormData) => void | Promise<void>; route?: RouteValue; airports: Option[]; fleets: Option[]; submitLabel: string }) {
  return <form action={action} className="route-form">
    {route?.id && <input type="hidden" name="id" value={route.id}/>}
    <fieldset><legend><span>01</span>Route identity</legend><p className="route-form-help">Define the operational identity shown in schedules, Dispatch and ACARS.</p><div className="route-form-grid route-form-grid-3">
      <label>Route code<input name="routeCode" required placeholder="MAD-VLC" defaultValue={route?.routeCode ?? ""}/><small>Internal network identifier</small></label>
      <label>Commercial flight number<input name="flightNumber" placeholder="HF1234" defaultValue={route?.flightNumber ?? ""}/><small>Passenger-facing flight number</small></label>
      <label>Default callsign<input name="callsign" placeholder="HPF1234" defaultValue={route?.callsign ?? ""}/><small>Operational ATC callsign</small></label>
    </div></fieldset>
    <fieldset><legend><span>02</span>Airport pair</legend><p className="route-form-help">All ACTIVE airports are available regardless of their original data source.</p><div className="route-form-grid">
      <label>Departure airport<select name="departureAirportId" required defaultValue={route?.departureAirportId ?? ""}><option value="">Select departure</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Arrival airport<select name="arrivalAirportId" required defaultValue={route?.arrivalAirportId ?? ""}><option value="">Select arrival</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Default fleet<select name="defaultFleetId" defaultValue={route?.defaultFleetId ?? ""}><option value="">No default fleet</option>{fleets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>Optional; schedules may override it</small></label>
      <label>Network policy<input name="networkPolicy" placeholder="Scheduled passenger" defaultValue={route?.networkPolicy ?? ""}/><small>Optional operational classification</small></label>
    </div></fieldset>
    <fieldset><legend><span>03</span>Flight planning defaults</legend><div className="route-form-grid route-form-grid-3">
      <label>Estimated duration<input name="durationMinutes" type="number" min="1" max="1440" placeholder="95" defaultValue={route?.scheduledDurationMinutes ?? ""}/><small>Minutes, block-to-block</small></label>
      <label>Default altitude<input name="cruiseAltitude" type="number" min="0" step="100" placeholder="35000" defaultValue={route?.cruiseAltitude ?? ""}/><small>Feet</small></label>
      <label>Default route string<input name="route" placeholder="NANDO UN725 VLC" defaultValue={route?.route ?? ""}/><small>Optional ATS routing</small></label>
    </div></fieldset>
    <fieldset><legend><span>04</span>Validity and notes</legend><div className="route-form-grid">
      <label>Effective from<input name="effectiveFrom" type="date" defaultValue={date(route?.effectiveFrom)}/></label>
      <label>Effective until<input name="effectiveUntil" type="date" defaultValue={date(route?.effectiveUntil)}/></label>
      <label className="route-form-span-2">Operational notes<textarea name="internalNotes" placeholder="Internal planning notes" defaultValue={route?.internalNotes ?? ""}/></label>
    </div></fieldset>
    <fieldset className="route-internal-section"><legend><span>!</span>Conflict protection</legend><p className="route-form-help">Possible duplicates are blocked. An authorized exception never overwrites an existing route.</p><div className="route-form-grid">
      <label className="route-toggle"><input type="checkbox" name="overrideConflicts" value="yes"/><span><strong>Confirm justified conflict override</strong><small>Use only after reviewing the existing flight number, callsign and airport pair.</small></span></label>
      <label className="route-form-span-2">Override reason<input name="overrideReason" placeholder="Required when override is selected"/></label>
    </div></fieldset>
    <div className="route-form-submit"><div><strong>Ready to create a controlled draft</strong><span>The route remains DRAFT until an authorized status change activates it.</span></div><button className="button">{submitLabel}</button></div>
  </form>;
}
