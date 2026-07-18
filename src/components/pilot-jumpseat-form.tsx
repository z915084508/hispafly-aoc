"use client";
import { useMemo, useState } from "react";
import { purchaseJumpseatAction } from "@/app/pilot/flight-offers/self-dispatch/actions";

type Airport = { id: string; icao: string; name: string | null; distanceKm: number; costCents: number };
export function PilotJumpseatForm({ currentIcao, airports, balanceCents }: { currentIcao: string; airports: Airport[]; balanceCents: number }) {
  const [open, setOpen] = useState(false), [airportId, setAirportId] = useState("");
  const selected = useMemo(() => airports.find((item) => item.id === airportId), [airports, airportId]);
  return <section className="card jumpseat-panel">
    <div className="card-header"><div><h2>Need to depart elsewhere?</h2><p className="meta">Use Jumpseat to move your crew position. The distance-based fare is deducted from your wallet.</p></div><button type="button" className="button secondary" onClick={() => setOpen(!open)}>{open ? "Close" : "Book Jumpseat"}</button></div>
    {open && <form action={purchaseJumpseatAction} className="inline-form">
      <input type="hidden" name="fromIcao" value={currentIcao}/>
      <label>Destination airport<select name="arrivalAirportId" value={airportId} onChange={(event) => setAirportId(event.target.value)} required><option value="">Select destination</option>{airports.map((item) => <option key={item.id} value={item.id}>{item.icao} · {item.name ?? "Unnamed"} · {item.distanceKm} km · EUR {(item.costCents / 100).toFixed(2)}</option>)}</select></label>
      <div><strong>{selected ? `EUR ${(selected.costCents / 100).toFixed(2)}` : "Select a destination"}</strong><p className="meta">Wallet balance: EUR {(balanceCents / 100).toFixed(2)}{selected && selected.costCents > balanceCents ? " · Insufficient balance" : ""}</p></div>
      <button className="button" disabled={!selected || selected.costCents > balanceCents}>Confirm Jumpseat</button>
    </form>}
  </section>;
}
