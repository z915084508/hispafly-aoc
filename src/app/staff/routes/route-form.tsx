"use client";

import { useState, useTransition } from "react";
import { suggestAutomaticRouteAction } from "./actions";
import styles from "./route-form.module.css";

type Option = { id: string; label: string };
type RouteValue = {
  id?: string; routeCode?: string | null;
  departureAirportId?: string | null; arrivalAirportId?: string | null; compatibleFleetIds?: string[];
  scheduledDurationMinutes?: number | null; cruiseAltitude?: number | null; route?: string | null;
  networkPolicy?: string | null; effectiveFrom?: Date | null; effectiveUntil?: Date | null; internalNotes?: string | null;
};
type AutomationPreview = {
  marketType: "DOMESTIC" | "SCHENGEN" | "NON_SCHENGEN";
  marketLabel: string;
  outboundRouteCode: string;
  returnRouteCode: string | null;
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
  const [compatibleFleetIds, setCompatibleFleetIds] = useState(route?.compatibleFleetIds ?? []);
  const [createReturnRoute, setCreateReturnRoute] = useState(!editing);
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
    const fleet = next.defaultFleetId ?? compatibleFleetIds[0] ?? "";
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

  return <form action={action} className="route-form">
    {route?.id && <input type="hidden" name="id" value={route.id}/>} 
    <fieldset>
      <legend><span>01</span>Route definition</legend>
      <p className="route-form-help">A route defines the airport pair. Flight number and callsign are assigned later when Programación creates a scheduled flight.</p>
      <div className="route-form-grid">
        <label>Route code<input name="routeCode" required value={routeCode} readOnly onChange={(event) => setRouteCode(event.target.value.toUpperCase())} placeholder="MAD-VLC"/><small>{editing ? "Generated identity is locked after creation" : "Generated from the selected Airport pair"}</small></label>
      </div>
      {!editing && <div className={styles.automationStatus}>
        <div><span>Market</span><strong>{preview?.marketLabel ?? "Select both airports"}</strong></div>
        <div><span>Flight identity</span><strong>Assigned in Programación</strong></div>
      </div>}
      {previewError && <div className={`feedback error ${styles.previewError}`}>{previewError}</div>}
    </fieldset>

    <fieldset>
      <legend><span>02</span>Airport pair</legend>
      <p className="route-form-help">Una conexión se considera completa cuando existen ambos sentidos. Al crear la ida, recomendamos crear también la vuelta.</p>
      <div className="route-form-grid">
        <label>Departure airport<select name="departureAirportId" required value={departureAirportId} disabled={editing} onChange={(event) => { const next = event.target.value; setDepartureAirportId(next); refreshPreview({ departureAirportId: next }); }}><option value="">Select departure</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>{editing && <input type="hidden" name="departureAirportId" value={departureAirportId}/>}<small>{editing ? "Locked after identity allocation" : "Select the operating origin"}</small></label>
        <label>Arrival airport<select name="arrivalAirportId" required value={arrivalAirportId} disabled={editing} onChange={(event) => { const next = event.target.value; setArrivalAirportId(next); refreshPreview({ arrivalAirportId: next }); }}><option value="">Select arrival</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>{editing && <input type="hidden" name="arrivalAirportId" value={arrivalAirportId}/>}<small>{editing ? "Locked after identity allocation" : "Select the operating destination"}</small></label>
        <label>Compatible fleets<select name="compatibleFleetIds" multiple required size={Math.min(8, Math.max(4, fleets.length))} value={compatibleFleetIds} onChange={(event) => { const next = [...event.currentTarget.selectedOptions].map((option) => option.value); setCompatibleFleetIds(next); refreshPreview({ defaultFleetId: next[0] ?? "" }); }}>{fleets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>Select every fleet authorized on this route. The first selection is used only for the duration estimate.</small></label>
        <label>Network policy<input name="networkPolicy" placeholder={preview?.marketLabel ?? "Automatically use market classification"} defaultValue={route?.networkPolicy ?? ""}/><small>Leave blank to store the automatic market classification</small></label>
      </div>
      {!editing && <label className={styles.returnToggle}>
        <input type="checkbox" name="createReturnRoute" value="yes" checked={createReturnRoute} onChange={(event) => { const next = event.target.checked; setCreateReturnRoute(next); refreshPreview({ createReturnRoute: next }); }}/>
        <span><strong>Crear también la ruta de regreso (recomendado)</strong><small>Both directions are created as routes. Flight numbers are assigned only when their schedules are created.</small></span>
      </label>}
      {!editing && createReturnRoute && preview?.returnRouteCode && <div className={styles.returnPreview}>
        <div><span>Outbound route</span><strong>{preview.outboundRouteCode}</strong></div>
        <div><span>Return route</span><strong>{preview.returnRouteCode}</strong></div>
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
      <p className="route-form-help">This override applies only to an intentional duplicate Airport pair or effective period.</p>
      <div className="route-form-grid">
        <label className="route-toggle"><input type="checkbox" name="overrideConflicts" value="yes"/><span><strong>Confirm justified route overlap</strong><small>The reason is recorded in the audit log.</small></span></label>
        <label className="route-form-span-2">Override reason<input name="overrideReason" placeholder="Required when override is selected"/></label>
      </div>
    </fieldset>

    <div className="route-form-submit"><div><strong>{editing ? "Ready to save the route" : createReturnRoute ? "Ready to create two route drafts" : "Ready to create a route draft"}</strong><span>{editing ? "Changes are recorded in the audit log." : "Flight number and callsign will be allocated later in Programación."}</span></div><button className="button" disabled={previewPending}>{previewPending ? "Checking route…" : submitLabel}</button></div>
  </form>;
}
