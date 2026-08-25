"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_MIN_TURNAROUND_MINUTES } from "@/lib/native-scheduling/constants";
import type { ScheduleValidationResult } from "@/lib/native-scheduling/types";
import type { ProgramacionAircraftOption, ProgramacionFleetOption, ProgramacionFormValue, ProgramacionRouteOption } from "./types";

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fromTime = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
const labels = ["L", "M", "X", "J", "V", "S", "D"];
const shiftDays = (days: number[], offset: number) => days.map((day) => ((day - 1 + offset) % 7) + 1).sort();

async function requestValidation(payload: Record<string, unknown>) {
  const response = await fetch("/api/staff/operations/flight-schedules/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo validar.");
  return body as ScheduleValidationResult;
}

export function ScheduleForm({
  action,
  value = {},
  routes,
  fleets,
  aircraft,
  submitLabel,
  cancelHref = "/staff/operations/programacion",
  hiddenFields = {},
  rotationContext,
  allowReturnCreation = true,
}: {
  action: (form: FormData) => void | Promise<void>;
  value?: ProgramacionFormValue;
  routes: ProgramacionRouteOption[];
  fleets: ProgramacionFleetOption[];
  aircraft: ProgramacionAircraftOption[];
  submitLabel: string;
  cancelHref?: string;
  hiddenFields?: Record<string, string>;
  rotationContext?: ReactNode;
  allowReturnCreation?: boolean;
}) {
  const returnCreationEnabled = allowReturnCreation && !value.id && !hiddenFields.returnTo?.includes("reverseOf=");
  const [code, setCode] = useState(value.code ?? "");
  const [codeTouched, setCodeTouched] = useState(Boolean(value.id || value.code));
  const [routeId, setRouteId] = useState(value.routeId ?? "");
  const [fleetIds, setFleetIds] = useState<string[]>(value.eligibleFleetIds?.length ? value.eligibleFleetIds : value.defaultFleetId ? [value.defaultFleetId] : []);
  const [days, setDays] = useState(value.daysOfWeek ?? []);
  const [departure, setDeparture] = useState(value.departureTimeMinutesUtc ?? 480);
  const [duration, setDuration] = useState(value.scheduledDurationMinutes ?? 60);
  const [validation, setValidation] = useState<ScheduleValidationResult | null>(null);
  const [returnValidation, setReturnValidation] = useState<ScheduleValidationResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [createReturn, setCreateReturn] = useState(false);
  const [returnRouteId, setReturnRouteId] = useState("");
  const [returnCode, setReturnCode] = useState("");
  const [returnCodeTouched, setReturnCodeTouched] = useState(false);
  const [returnTurnaround, setReturnTurnaround] = useState(DEFAULT_MIN_TURNAROUND_MINUTES);

  const route = routes.find((item) => item.id === routeId);
  const selectableFleets = route?.compatibleFleetIds.length ? fleets.filter((fleet) => route.compatibleFleetIds.includes(fleet.id)) : fleets;
  const arrival = (departure + duration) % 1440;
  const nextDay = departure + duration >= 1440;
  const reverseRoutes = useMemo(() => route ? routes.filter((item) => item.departure === route.arrival && item.arrival === route.departure) : [], [route, routes]);
  const returnRoute = reverseRoutes.find((item) => item.id === returnRouteId);
  const returnDuration = returnRoute?.duration ?? 0;
  const absoluteReturnDeparture = departure + duration + returnTurnaround;
  const returnDayOffset = Math.floor(absoluteReturnDeparture / 1440);
  const returnDeparture = absoluteReturnDeparture % 1440;
  const returnDays = shiftDays(days, returnDayOffset);
  const returnArrival = (returnDeparture + returnDuration) % 1440;
  const returnArrivalNextDay = returnDeparture + returnDuration >= 1440;

  useEffect(() => {
    if (value.id || codeTouched) return;
    const selected = routes.find((item) => item.id === routeId);
    // Synchronize the untouched code field when the selected route changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(selected?.routeCode ?? "");
  }, [codeTouched, routeId, routes, value.id]);

  useEffect(() => {
    if (!returnCreationEnabled) return;
    const selected = routes.find((item) => item.id === routeId);
    const candidates = selected ? routes.filter((item) => item.departure === selected.arrival && item.arrival === selected.departure) : [];
    // Reset the dependent return-leg form when its source route changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReturnRouteId(candidates.length === 1 ? candidates[0].id : "");
    setReturnCodeTouched(false);
    setReturnValidation(null);
  }, [returnCreationEnabled, routeId, routes]);

  useEffect(() => {
    // Preserve manual edits while deriving the untouched return code.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!returnCodeTouched) setReturnCode(returnRoute?.routeCode ?? (code ? `${code}-R` : ""));
  }, [code, returnCodeTouched, returnRoute]);

  const validate = async () => {
    setChecking(true);
    setCheckError("");
    setValidation(null);
    setReturnValidation(null);
    try {
      const effectiveFrom = (document.querySelector('[name="effectiveFrom"]') as HTMLInputElement | null)?.value;
      const effectiveUntil = (document.querySelector('[name="effectiveUntil"]') as HTMLInputElement | null)?.value;
      const bookingOpenOffsetMinutes = Number((document.querySelector('[name="bookingOpenOffsetMinutes"]') as HTMLInputElement | null)?.value ?? 10080);
      const bookingCloseOffsetMinutes = Number((document.querySelector('[name="bookingCloseOffsetMinutes"]') as HTMLInputElement | null)?.value ?? 60);
      const generationHorizonDays = Number((document.querySelector('[name="generationHorizonDays"]') as HTMLInputElement | null)?.value ?? 30);
      const common = {
        eligibleFleetIds: fleetIds,
        defaultFleetId: fleetIds[0] || null,
        assignedAircraftId: null,
        effectiveFrom: `${effectiveFrom}T00:00:00.000Z`,
        effectiveUntil: effectiveUntil ? `${effectiveUntil}T00:00:00.000Z` : null,
        bookingOpenOffsetMinutes,
        bookingCloseOffsetMinutes,
        generationHorizonDays,
      };
      const outboundPromise = requestValidation({
        scheduleId: value.id,
        routeId,
        daysOfWeek: days,
        departureTimeMinutesUtc: departure,
        arrivalTimeMinutesUtc: arrival,
        scheduledDurationMinutes: duration,
        ...common,
      });
      if (createReturn) {
        if (!returnRoute || !returnDuration) throw new Error("Selecciona una ruta de regreso con una duración válida.");
        const [outboundResult, returnResult] = await Promise.all([
          outboundPromise,
          requestValidation({
            routeId: returnRoute.id,
            daysOfWeek: returnDays,
            departureTimeMinutesUtc: returnDeparture,
            arrivalTimeMinutesUtc: returnArrival,
            scheduledDurationMinutes: returnDuration,
            ...common,
          }),
        ]);
        setValidation(outboundResult);
        setReturnValidation(returnResult);
      } else {
        setValidation(await outboundPromise);
      }
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : "No se pudo validar.");
    } finally {
      setChecking(false);
    }
  };

  const resultSummary = (title: string, result: ScheduleValidationResult) => <div>
    <strong>{title}: {result.valid ? "Programación válida" : `${result.errors.length} conflictos`} · ${result.warnings.length} advertencias</strong>
    {[...result.errors, ...result.warnings].length > 0 && <ul>{[...result.errors, ...result.warnings].map((item, index) => <li key={`${title}-${item.code}-${index}`}><b>{item.code}</b> — {item.message}</li>)}</ul>}
  </div>;

  return <form action={action} className="programacion-form">
    {value.id && <input type="hidden" name="id" value={value.id}/>}<input type="hidden" name="departureTimeMinutesUtc" value={departure}/><input type="hidden" name="autoGenerateCode" value={!value.id && !codeTouched ? "yes" : "no"}/><input type="hidden" name="autoGenerateReturnCode" value={!returnCodeTouched ? "yes" : "no"}/>{Object.entries(hiddenFields).map(([name, fieldValue]) => <input key={name} type="hidden" name={name} value={fieldValue}/>)}
    <fieldset><legend>Identidad y ruta</legend><div className="form-grid"><label>Código interno<input name="code" value={code} placeholder="Se genera al seleccionar la ruta" onChange={(event) => { setCode(event.target.value); setCodeTouched(true); }}/>{!value.id && <span className="secondary">{codeTouched ? "Código personalizado. Debe ser único." : "Automático: usa el código de ruta y añade -02, -03… si ya existe."}</span>}</label><label>Descripción interna<input name="name" defaultValue={value.name ?? ""}/></label><label className="programacion-wide">Ruta<select name="routeId" required value={routeId} onChange={(event) => { const selected = routes.find((item) => item.id === event.target.value); setRouteId(event.target.value); setFleetIds((current) => selected?.compatibleFleetIds.length ? current.filter((id) => selected.compatibleFleetIds.includes(id)) : current); if (selected?.duration) setDuration(selected.duration); }}><option value="">Selecciona una ruta</option>{routes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>{route && <div className="programacion-route-summary"><span>Número de vuelo / Callsign <strong>Se asignan automáticamente al crear</strong></span><span>Trayecto <strong>{route.departure} → {route.arrival}</strong></span><span>Duración base <strong>{route.duration ? hhmm(route.duration) : "—"}</strong></span></div>}</fieldset>
    <fieldset><legend>Días y horario UTC</legend><div className="programacion-days">{labels.map((label, index) => { const day = index + 1; return <label className={days.includes(day) ? "selected" : ""} key={day}><input type="checkbox" name="daysOfWeek" value={day} checked={days.includes(day)} onChange={() => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort())}/><span>{label}</span></label>; })}</div><div className="form-grid"><label>Salida UTC<input type="time" required value={hhmm(departure)} onChange={(event) => setDeparture(fromTime(event.target.value))}/></label><label>Duración (minutos)<input name="scheduledDurationMinutes" type="number" min="1" max="1440" required value={duration} onChange={(event) => setDuration(Number(event.target.value))}/></label><div className="programacion-arrival"><span>Llegada UTC</span><strong>{hhmm(arrival)}{nextDay ? " (+1 día)" : ""}</strong></div></div></fieldset>
    <fieldset><legend>Flotas elegibles</legend><label>Selecciona una o varias flotas<select name="eligibleFleetIds" multiple required size={Math.min(6, Math.max(3, selectableFleets.length))} value={fleetIds} onChange={(event) => setFleetIds([...event.currentTarget.selectedOptions].map((option) => option.value))}>{selectableFleets.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.status}</option>)}</select><span className="secondary">Solo aparecen las flotas compatibles configuradas en la Route. Las rutas antiguas sin configuración permiten todas las flotas activas.</span></label></fieldset>
    <fieldset><legend>Vigencia y configuración</legend><div className="form-grid"><label>Válido desde<input name="effectiveFrom" type="date" required defaultValue={value.effectiveFrom}/></label><label>Válido hasta<input name="effectiveUntil" type="date" defaultValue={value.effectiveUntil}/></label><label>Reservas abren antes (min)<input name="bookingOpenOffsetMinutes" type="number" min="0" defaultValue={value.bookingOpenOffsetMinutes ?? 10080}/></label><label>Reservas cierran antes (min)<input name="bookingCloseOffsetMinutes" type="number" min="0" defaultValue={value.bookingCloseOffsetMinutes ?? 60}/></label><label>Horizonte de generación (días)<input name="generationHorizonDays" type="number" min="1" max="365" defaultValue={value.generationHorizonDays ?? 30}/></label><label className="programacion-wide">Notas<textarea name="notes" defaultValue={value.notes ?? ""}/></label></div></fieldset>
    {returnCreationEnabled && <fieldset><legend>Vuelo de regreso (opcional)</legend><label className="programacion-wide"><input type="checkbox" name="createReturn" value="yes" checked={createReturn} onChange={(event) => { setCreateReturn(event.target.checked); if (!event.target.checked) setReturnValidation(null); }}/> Crear también el vuelo de regreso</label>{createReturn && <><p className="meta">El regreso utilizará la misma aeronave, flota, vigencia, configuración de reservas y horizonte. Se guardarán ambos como borradores.</p><div className="form-grid"><label>Código interno del regreso<input name="returnCode" value={returnCode} placeholder="Automático" onChange={(event) => { setReturnCode(event.target.value); setReturnCodeTouched(true); }}/><span className="secondary">{returnCodeTouched ? "Código personalizado." : "Generado automáticamente desde la ruta de regreso."}</span></label><label>Ruta de regreso<select name="returnRouteId" required value={returnRouteId} onChange={(event) => { setReturnRouteId(event.target.value); setReturnCodeTouched(false); }}><option value="">Selecciona una ruta inversa</option>{reverseRoutes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Turnaround en destino (min)<input name="returnTurnaroundMinutes" type="number" min={DEFAULT_MIN_TURNAROUND_MINUTES} max="1440" required value={returnTurnaround} onChange={(event) => setReturnTurnaround(Number(event.target.value))}/></label></div>{!route && <div className="notice">Selecciona primero la ruta de ida.</div>}{route && reverseRoutes.length === 0 && <div className="notice">No existe una Route operativa para {route.arrival} → {route.departure}. Créala antes de guardar ida y regreso.</div>}{route && reverseRoutes.length > 1 && !returnRouteId && <div className="notice">Hay varias rutas inversas. Selecciona la que debe operar el regreso.</div>}{returnRoute && <div className="programacion-route-summary"><span>Trayecto <strong>{returnRoute.departure} → {returnRoute.arrival}</strong></span><span>Días <strong>{returnDays.map((day) => labels[day - 1]).join(" ")}</strong></span><span>Salida UTC <strong>{hhmm(returnDeparture)}{returnDayOffset ? ` (+${returnDayOffset} día${returnDayOffset > 1 ? "s" : ""})` : ""}</strong></span><span>Llegada UTC <strong>{hhmm(returnArrival)}{returnArrivalNextDay ? " (+1 día)" : ""}</strong></span><span>Duración <strong>{returnDuration ? hhmm(returnDuration) : "—"}</strong></span></div>}</>}</fieldset>}
    {rotationContext}
    {(validation || returnValidation || checkError) && <div className={`programacion-check ${validation?.valid && (!returnValidation || returnValidation.valid) ? "valid" : "invalid"}`}>{checkError && <strong>{checkError}</strong>}{validation && resultSummary("IDA", validation)}{returnValidation && resultSummary("REGRESO", returnValidation)}</div>}
    <div className="button-row"><button type="button" className="button secondary" disabled={checking} onClick={validate}>{checking ? "Comprobando…" : "Comprobar programación"}</button><button className="button">{createReturn ? "Guardar ida y regreso" : submitLabel}</button><Link href={cancelHref}>Cancelar</Link></div>
  </form>;
}
