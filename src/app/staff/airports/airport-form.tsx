"use client";

import { useEffect, useRef, useState } from "react";

type AirportValue = {
  id?: string; icao?: string | null; iata?: string | null; name?: string | null; city?: string | null;
  country?: string | null; region?: string | null; timezone?: string | null; latitude?: number | null; longitude?: number | null;
};
export function AirportForm({ action, airport, submitLabel }: { action: (form: FormData) => void | Promise<void>; airport?: AirportValue; submitLabel: string }) {
  const [icao, setIcao] = useState(airport?.icao ?? "");
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "missing" | "error">("idle");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const code = icao.trim().toUpperCase();
    if (airport?.id || !/^[A-Z]{4}$/.test(code)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLookupState("loading");
      try {
        const response = await fetch(`/api/airports/lookup?icao=${encodeURIComponent(code)}`, { signal: controller.signal });
        if (response.status === 404) { setLookupState("missing"); return; }
        if (!response.ok) throw new Error("lookup failed");
        const data = await response.json() as Record<string, string | number | null>;
        const form = formRef.current;
        if (!form) return;
        for (const key of ["iata", "name", "city", "country", "region", "timezone", "latitude", "longitude"]) {
          const input = form.elements.namedItem(key);
          if (input instanceof HTMLInputElement) input.value = data[key] == null ? "" : String(data[key]);
        }
        setLookupState("found");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setLookupState("error");
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [icao, airport?.id]);

  return <form ref={formRef} action={action} className="card">
    {airport?.id && <input type="hidden" name="id" value={airport.id}/>}
    <div className="form-grid">
      <label>ICAO<input name="icao" required maxLength={4} value={icao} onChange={(event) => { setIcao(event.target.value.toUpperCase().replace(/[^A-Z]/g, "")); setLookupState("idle"); }}/>{!airport?.id && <small className={`airport-lookup-status ${lookupState}`}>{lookupState === "loading" ? "Looking up airport…" : lookupState === "found" ? "Airport details filled automatically. Please review them." : lookupState === "missing" ? "Airport not found. You can enter the details manually." : lookupState === "error" ? "Lookup unavailable. You can continue manually." : "Enter a 4-letter ICAO code to fill the details automatically."}</small>}</label>
      <label>IATA<input name="iata" maxLength={3} defaultValue={airport?.iata ?? ""}/></label>
      <label>Name<input name="name" defaultValue={airport?.name ?? ""}/></label>
      <label>City<input name="city" defaultValue={airport?.city ?? ""}/></label>
      <label>Country<input name="country" defaultValue={airport?.country ?? ""}/></label>
      <label>Region<input name="region" defaultValue={airport?.region ?? ""}/></label>
      <label>IANA timezone<input name="timezone" placeholder="Europe/Madrid" defaultValue={airport?.timezone ?? ""}/></label>
      <label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" defaultValue={airport?.latitude ?? ""}/></label>
      <label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" defaultValue={airport?.longitude ?? ""}/></label>
    </div>
    <div className="button-row"><button className="button">{submitLabel}</button></div>
  </form>;
}
