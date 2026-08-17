"use client";

import { useState, useTransition } from "react";
import { suggestAircraftIdentityAction } from "@/app/staff/aircraft/actions";
import type { AircraftDeliveryMetadata } from "@/lib/native-flight/aircraft-delivery";

type F = {
  id: string;
  code: string | null;
  name: string | null;
  type?: string | null;
  typicalSeatCapacity?: number | null;
  maxPassengers?: number | null;
  maxCargoKg?: number | null;
};
type A = { id: string; icao: string; name: string | null };
type V = {
  id?: string;
  registration?: string | null;
  aircraftType?: string | null;
  nativeFleetId?: string | null;
  operationMode?: "FREE" | "SCHEDULED" | "FLEX";
  delivery?: AircraftDeliveryMetadata | null;
  hubs?: { airportId: string }[];
  name?: string | null;
  serialNumber?: string | null;
  selcal?: string | null;
  deliveryDate?: Date | null;
  inServiceDate?: Date | null;
  cabinConfiguration?: string | null;
  seatCapacity?: number | null;
  cargoCapacityKg?: number | null;
  internalNotes?: string | null;
};

type FormOperationMode = "FREE" | "SCHEDULED" | "FLEX" | "DELIVERY";
const date = (d?: Date | null) => d?.toISOString().slice(0, 10) ?? "";

export function AircraftManagementForm({ action, fleets, airports, value }: {
  action: (f: FormData) => void | Promise<void>;
  fleets: F[];
  airports: A[];
  value?: V;
}) {
  const editing = Boolean(value?.id);
  const deliveryLocked = editing && value?.delivery?.active === true;
  const hubs = new Set(value?.hubs?.map((h) => h.airportId) ?? []);
  const [type, setType] = useState(value?.aircraftType ?? "");
  const [registration, setRegistration] = useState(value?.registration ?? "");
  const [selcal, setSelcal] = useState(value?.selcal ?? "");
  const [serial, setSerial] = useState(value?.serialNumber ?? "");
  const [seats, setSeats] = useState(value?.seatCapacity?.toString() ?? "");
  const [cargo, setCargo] = useState(value?.cargoCapacityKg?.toString() ?? "");
  const [cabin, setCabin] = useState(value?.cabinConfiguration ?? "");
  const [operationMode, setOperationMode] = useState<FormOperationMode>(value?.delivery?.active ? "DELIVERY" : value?.operationMode ?? "FLEX");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  const applyFleet = (id: string) => {
    const f = fleets.find((x) => x.id === id);
    if (!f) return;
    if (f.type) setType(f.type);
    if (f.typicalSeatCapacity ?? f.maxPassengers) setSeats(String(f.typicalSeatCapacity ?? f.maxPassengers));
    if (f.maxCargoKg) setCargo(String(f.maxCargoKg));
    if ((f.typicalSeatCapacity ?? f.maxPassengers) && !cabin) setCabin(`Y${f.typicalSeatCapacity ?? f.maxPassengers}`);
  };

  const generate = () => start(async () => {
    try {
      const x = await suggestAircraftIdentityAction(type);
      setRegistration(x.registration);
      setSelcal(x.selcal);
      setMessage("Spanish registration and ICAO-compatible SELCAL generated. Enter the real manufacturer MSN separately.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to generate identity.");
    }
  });

  return <form action={action} className="route-form aircraft-create-form">
    {value?.id && <input type="hidden" name="id" value={value.id} />}
    <fieldset>
      <legend><span>01</span>Identity</legend>
      <p className="route-form-help">Select a Fleet or enter the ICAO type, then generate a unique HISPAFLY identity.</p>
      <div className="route-form-grid route-form-grid-3">
        <label>Fleet<select name="fleetId" required defaultValue={value?.nativeFleetId ?? ""} onChange={(e) => applyFleet(e.target.value)}><option value="">Select active Fleet</option>{fleets.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}</select></label>
        <label>ICAO Aircraft Type<input name="aircraftType" required value={type} onChange={(e) => setType(e.target.value.toUpperCase())} maxLength={4} /></label>
        <label>Registration<input name="registration" required pattern="EC-[A-Z]{3}" value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} placeholder="EC-XXX" /></label>
        <label>Serial number<input name="serialNumber" value={serial} onChange={(e) => setSerial(e.target.value)} /></label>
        <label>SELCAL<input name="selcal" value={selcal} onChange={(e) => setSelcal(e.target.value.toUpperCase())} placeholder="AB-CD" /></label>
        <button className="button secondary" type="button" onClick={generate} disabled={pending || editing}>{pending ? "Generating…" : "Generate identity"}</button>
      </div>
      {message && <div className="notice">{message}</div>}
    </fieldset>

    <fieldset>
      <legend><span>02</span>Operations</legend>
      <div className="route-form-grid">
        <label>Operation mode
          {deliveryLocked && <input type="hidden" name="operationMode" value="DELIVERY" />}
          <select name={deliveryLocked ? undefined : "operationMode"} required value={operationMode} disabled={deliveryLocked} onChange={(e) => setOperationMode(e.target.value as FormOperationMode)}>
            <option value="FREE">FREE · free flights only</option>
            <option value="SCHEDULED">SCHEDULED · PROGRAMACIÓN only</option>
            <option value="FLEX">FLEX · reserve for either operation</option>
            <option value="DELIVERY">DELIVERY · delivery / ferry flights only</option>
          </select>
          {deliveryLocked && <small>Complete the delivery workflow before returning this aircraft to normal operations.</small>}
        </label>
        <label>Operational HUBS<select name="hubAirportIds" multiple size={4} defaultValue={[...hubs]}>{airports.map((a) => <option key={a.id} value={a.id}>{a.icao} · {a.name ?? "Unnamed"}</option>)}</select><small>Ctrl/Cmd + click para seleccionar varios.</small></label>
      </div>
      {operationMode === "DELIVERY" && <div className="card" style={{ marginTop: 18 }}>
        <h3>Delivery information</h3>
        <p className="route-form-help">The aircraft stays outside normal PROGRAMACIÓN and FREE operations until Staff completes delivery and enters it into service.</p>
        <div className="route-form-grid route-form-grid-3">
          <label>Delivery airport (ICAO)<input name="deliveryOriginIcao" required maxLength={4} pattern="[A-Za-z0-9]{4}" defaultValue={value?.delivery?.originIcao ?? ""} placeholder="LPPT" onInput={(e) => { e.currentTarget.value = e.currentTarget.value.toUpperCase(); }} /></label>
          <label>Delivery destination (ICAO)<input name="deliveryDestinationIcao" required maxLength={4} pattern="[A-Za-z0-9]{4}" defaultValue={value?.delivery?.destinationIcao ?? ""} placeholder="LEVC" onInput={(e) => { e.currentTarget.value = e.currentTarget.value.toUpperCase(); }} /></label>
          <label>Mode after delivery<select name="postDeliveryOperationMode" required defaultValue={value?.delivery?.postDeliveryOperationMode ?? "SCHEDULED"}><option value="SCHEDULED">SCHEDULED · PROGRAMACIÓN only</option><option value="FREE">FREE · free flights only</option><option value="FLEX">FLEX · reserve for either operation</option></select></label>
        </div>
      </div>}
    </fieldset>

    <fieldset>
      <legend><span>03</span>Cabin and capacity</legend>
      <div className="route-form-grid route-form-grid-3">
        <label>Cabin configuration<input name="cabinConfiguration" value={cabin} onChange={(e) => setCabin(e.target.value.toUpperCase())} placeholder="Y180 or C12 Y150" /></label>
        <label>Seat capacity<input name="seatCapacity" type="number" min="0" value={seats} onChange={(e) => setSeats(e.target.value)} /></label>
        <label>Cargo capacity (kg)<input name="cargoCapacityKg" type="number" min="0" value={cargo} onChange={(e) => setCargo(e.target.value)} /></label>
      </div>
    </fieldset>

    <fieldset>
      <legend><span>04</span>Service details</legend>
      <div className="route-form-grid">
        <label>Name<input name="name" defaultValue={value?.name ?? ""} /></label>
        <label>{operationMode === "DELIVERY" ? "Planned delivery date" : "Delivery date"}<input name="deliveryDate" type="date" defaultValue={date(value?.deliveryDate)} /></label>
        <label>In-service date<input name="inServiceDate" type="date" defaultValue={date(value?.inServiceDate)} /></label>
        <label>Notes<textarea name="internalNotes" defaultValue={value?.internalNotes ?? ""} /></label>
      </div>
    </fieldset>

    <div className="route-form-submit"><div><strong>{editing ? "Ready to update Aircraft" : "Ready to create Aircraft"}</strong><span>All changes are protected by permission checks and audit logging.</span></div><button className="button">Save Aircraft</button></div>
  </form>;
}
