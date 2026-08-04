"use client";

import { useState, useTransition } from "react";
import { suggestAutomaticRouteAction } from "./actions";
import styles from "./route-form.module.css";

type Option = { id: string; label: string };
type RouteValue = {
  id?: string; routeCode?: string | null; flightNumber?: string | null; callsign?: string | null;
  departureAirportId?: string | null; arrivalAirportId?: string | null; defaultFleetId?: string | null;
  scheduledDurationMinutes?: number | null; cruiseAltitude?: number | null; route?: string | null;
  networkPolicy?: string | null; effectiveFrom?: Date | null; effectiveUntil?: Date | null; internalNotes?: string | null;
};
type AutomationPreview = {
  marketType: "DOMESTIC" | "SCHENGEN" | "NON_SCHENGEN";
  marketLabel: string;
  outboundRouteCode: string;
  returnRouteCode: string | null;
  outbound: { number: number; flightNumber: string; callsign: string };
  return: { number: number; flightNumber: string; callsign: string } | null;
  distanceNm: number | null;
  durationMinutes: number;
  durationSource: string;
};

const date = (value?: Date | null) => value ? value.toISOString().slice(0, 10) : "";

export function RouteForm({ action, route, airports, fleets, submitLabel }: {
  action: (form: FormData) => void | Promise<void>;
  route?: RouteValue;
  airports: Option[];
  fleets: Option[];
  submitLabel: string;
}) {
  const editing = Boolean(route?.id);
  const [departureAirportId, setDepartureAirportId] = useState(route?.departureAirportId ?? "");
  const [arrivalAirportId, setArrivalAirportId] = useState(route?.arrivalAirportId ?? "");
  const [defaultFleetId, setDefaultFleetId] = useState(route?.defaultFleetId ?? "");
  const [createReturnRoute, setCreateReturnRoute] = useState(false);
  const [routeCode, setRouteCode] = useState(route?.routeCode ?? "");
  const [durationMinutes, setDurationMinutes] = useState(route?.scheduledDurationMinutes?.toString() ?? "");
  const [preview, setPreview] = useState<AutomationPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewPending, startPreviewTransition] = useTransition();

  const refreshPreview = (next: {
    departureAirportId?: string;
    arrivalAirportId?: string;
    defaultFleetId?: string;
    createReturnRoute?: boolean;
  } = {}) => {
    if (editing) return;
    const departure = next.departureAirportId ?? departureAirportId;
    const arrival = next.arrivalAirportId ?? arrivalAirportId;
    const fleet = next.defaultFleetId ?? defaultFleetId;
    const includeReturn = next.createReturnRoute ?? createReturnRoute;
    if (!departure || !arrival || departure === arrival) {
      setPreview(null);
      setPreviewError(departure && arrival && departure === arrival ? "Departure and arrival airports must differ." : "");
      return;
    }
    startPreviewTransition(async () => {
      try {
        const result = await suggestAutomaticRouteAction({
          departureAirportId: departure,
          arrivalAirportId: arrival,
          defaultFleetId: fleet || undefined,
          durationMinutes: durationMinutes ? Number(durationMinutes) : null,
          createReturnRoute: includeReturn,
        });
        setPreview(result);
        setRouteCode(result.outboundRouteCode);
        setDurationMinutes(String(result.durationMinutes));
        setPreviewError("");
      } catch (error) {
        setPreview(null);
        setPreviewError(error instanceof Error ? error.message : "Unable to generate route identity.");
      }
    });
  };

  const flightNumber = editing ? route?.flightNumber ?? "" : preview?.outbound.flightNumber ?? "";
  const callsign = editing ? route?.callsign ?? "" : preview?.outbound.callsign ?? "";

  return <form action={action} className="route-form">
    {route?.id && <input type="hidden" name="id" value={route.id}/>} 
    <fieldset>
      <legend><span>01</span>Route identity</legend>
      <p className="route-form-help">Flight number and callsign are assigned automatically from the route market and protected against duplicates.</p>
      <div className="route-form-grid route-form-grid-3">
        <label>Route code<input name="routeCode" required value={routeCode} readOnly={!editing} onChange={(event) => setRouteCode(event.target.value.toUpperCase())} placeholder="MAD-VLC"/><small>{editing ? "Internal network identifier" : "Generated from the selected Airport pair"}</small></label>
        <label>Commercial flight number<input name="flightNumber" value={flightNumber} readOnly placeholder="Assigned automatically"/><small>{editing ? "Identity is locked after creation" : "HF1xxx domestic · HF3xxx Schengen · HF6xxx non-Schengen"}</small></label>
        <label>Default callsign<input name="callsign" value={callsign} readOnly placeholder="Assigned automatically"/><small>HPF followed by the same four digits</small></label>
      </div>
      {!editing && <div className={styles.automationStatus}>
        <div><span>Market</span><strong>{preview?.marketLabel ?? "Select both airports"}</strong></div>
        <div><span>Identity status</span><strong>{previewPending ? "Checking available numbers…" : preview ? "Available at preview time" : "Pending"}</strong></div>
        <div><span>Number range</span><strong>{preview?.marketType === "DOMESTIC" ? "HF1000–HF2999" : preview?.marketType === "SCHENGEN" ? "HF3000–HF5999" : preview?.marketType === "NON_SCHENGEN" ? "HF6000–HF8999" : "—"}</strong></div>
      </div>}
      {previewError && <div className={`feedback error ${styles.previewError}`}>{previewError}</div>}
    </fieldset>

    <fieldset>
      <legend><span>02</span>Airport pair</legend>
      <p className="route-form-help">Country and coordinate data are used to classify the market and estimate block time.</p>
      <div className="route-form-grid">
        <label>Departure airport<select name="departureAirportId" required value={departureAirportId} onChange={(event) => { const next = event.target.value; setDepartureAirportId(next); refreshPreview({ departureAirportId: next }); }}><option value="">Select departure</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Arrival airport<select name="arrivalAirportId" required value={arrivalAirportId} onChange={(event) => { const next = event.target.value; setArrivalAirportId(next); refreshPreview({ arrivalAirportId: next }); }}><option value="">Select arrival</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Default fleet<select name="defaultFleetId" value={defaultFleetId} onChange={(event) => { const next = event.target.value; setDefaultFleetId(next); refreshPreview({ defaultFleetId: next }); }}><option value="">No default fleet</option>{fleets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>Fleet cruise speed improves the duration estimate</small></label>
        <label>Network policy<input name="networkPolicy" placeholder={preview?.marketLabel ?? "Automatically use market classification"} defaultValue={route?.networkPolicy ?? ""}/><small>Leave blank to store the automatic market classification</small></label>
      </div>
      {!editing && <label className={styles.returnToggle}>
        <input type="checkbox" name="createReturnRoute" value="yes" checked={createReturnRoute} onChange={(event) => { const next = event.target.checked; setCreateReturnRoute(next); refreshPreview({ createReturnRoute: next }); }}/>
        <span><strong>Create return route at the same time</strong><small>The outbound receives an even number and the return receives the next odd number. Both are created in one transaction.</small></span>
      </label>}
      {!editing && createReturnRoute && preview?.return && <div className={styles.returnPreview}>
        <div><span>Outbound</span><strong>{preview.outboundRouteCode}</strong><small>{preview.outbound.flightNumber} · {preview.outbound.callsign}</small></div>
        <div><span>Return</span><strong>{preview.returnRouteCode}</strong><small>{preview.return.flightNumber} · {preview.return.callsign}</small></div>
      </div>}
    </fieldset>

    <fieldset>
      <legend><span>03</span>Flight planning defaults</legend>
      <div className="route-form-grid route-form-grid-3">
        <label>Estimated duration<input name="durationMinutes" type="number" min="1" max="1440" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} readOnly={!editing && Boolean(preview?.distanceNm)} placeholder="Calculated automatically"/><small>{!editing && preview ? `${preview.distanceNm ?? "—"} NM · ${preview.durationSource.replaceAll("_", " ").toLowerCase()}` : "Minutes, block-to-block"}</small></label>
        <label>Default altitude<input name="cruiseAltitude" type="number" min="0" step="100" placeholder="35000" defaultValue={route?.cruiseAltitude ?? ""}/><small>Feet</small></label>
        <label>Outbound route string<input name="route" placeholder="NANDO UN725 VLC" defaultValue={route?.route ?? ""}/><small>Optional ATS routing</small></label>
        {!editing && createReturnRoute && <label className="route-form-span-2">Return route string<input name="returnRoute" placeholder="Leave blank or enter the return ATS routing"/><small>The outbound route string is never reversed automatically.</small></label>}
      </div>
    </fieldset>

    <fieldset>
      <legend><span>04</span>Validity and notes</legend>
      <div className="route-form-grid">
        <label>Effective from<input name="effectiveFrom" type="date" defaultValue={date(route?.effectiveFrom)}/></label>
        <label>Effective until<input name="effectiveUntil" type="date" defaultValue={date(route?.effectiveUntil)}/></label>
        <label className="route-form-span-2">Operational notes<textarea name="internalNotes" placeholder="Internal planning notes" defaultValue={route?.internalNotes ?? ""}/></label>
      </div>
    </fieldset>

    <fieldset className="route-internal-section">
      <legend><span>!</span>Conflict protection</legend>
      <p className="route-form-help">Automatic identities are always unique. This override applies only to an intentional duplicate Airport pair or effective period.</p>
      <div className="route-form-grid">
        <label className="route-toggle"><input type="checkbox" name="overrideConflicts" value="yes"/><span><strong>Confirm justified route overlap</strong><small>It never overrides or reuses a flight number or callsign.</small></span></label>
        <label className="route-form-span-2">Override reason<input name="overrideReason" placeholder="Required when override is selected"/></label>
      </div>
    </fieldset>

    <div className="route-form-submit"><div><strong>{editing ? "Ready to save the route" : createReturnRoute ? "Ready to create two controlled drafts" : "Ready to create a controlled draft"}</strong><span>{editing ? "Changes are recorded in the audit log." : "The final identity is allocated again inside the database transaction to prevent races and duplicates."}</span></div><button className="button" disabled={previewPending}>{previewPending ? "Checking identity…" : submitLabel}</button></div>
  </form>;
}
