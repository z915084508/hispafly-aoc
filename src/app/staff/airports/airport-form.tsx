type AirportValue = {
  id?: string; icao?: string | null; iata?: string | null; name?: string | null; city?: string | null;
  country?: string | null; region?: string | null; timezone?: string | null; latitude?: number | null; longitude?: number | null;
};
export function AirportForm({ action, airport, submitLabel }: { action: (form: FormData) => void | Promise<void>; airport?: AirportValue; submitLabel: string }) {
  return <form action={action} className="card">
    {airport?.id && <input type="hidden" name="id" value={airport.id}/>}
    <div className="form-grid">
      <label>ICAO<input name="icao" required maxLength={4} defaultValue={airport?.icao ?? ""}/></label>
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
