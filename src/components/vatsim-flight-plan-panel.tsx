const fieldLabels: Record<string, string> = {
  "2": "Callsign", "3": "Aircraft / equipment", "4": "Cruise speed", "5": "Departure",
  "6": "Departure UTC", "7": "Cruise level", "8": "Route", "9": "Destination",
  "10a": "EET hours", "10b": "EET minutes", "11": "Remarks", "12a": "Endurance hours",
  "12b": "Endurance minutes", "13": "Alternate",
};

export function VatsimFlightPlanPanel({ ofpId, fields, icaoText, missing, unlocked }: { ofpId: string; fields: Record<string, string>; icaoText: string; missing: string[]; unlocked: boolean }) {
  const ready = unlocked && missing.length === 0;
  return <section className="card vatsim-plan-card">
    <div className="card-header"><div><h2 className="card-title">VATSIM flight plan</h2><p className="meta">Generated from the signed SimBrief OFP</p></div><span className={`badge ${ready ? "" : "amber"}`}>{ready ? "READY" : "CHECK REQUIRED"}</span></div>
    <div className="vatsim-plan-grid">
      {Object.entries(fieldLabels).map(([key, label]) => <div className={key === "8" || key === "11" ? "wide" : ""} key={key}><span>{label}</span><strong>{fields[key] || (key === "13" ? "Not specified (optional)" : "Missing")}</strong></div>)}
    </div>
    {missing.length > 0 && <div className="notice vatsim-missing"><strong>Complete these items before filing:</strong> {missing.join(", ")}.</div>}
    <div className="vatsim-icao-preview"><div><strong>Automatic ICAO payload preview</strong><span>This exact SimBrief plan will be imported into the official VATSIM form.</span></div><pre>{icaoText}</pre></div>
    <div className="vatsim-plan-actions">
      {ready ? <a className="button" href={`/api/vatsim/prefile?ofpId=${encodeURIComponent(ofpId)}`} target="_blank" rel="noreferrer">IMPORT PLAN TO VATSIM</a> : <button className="button disabled-button" type="button" disabled>VATSIM IMPORT NOT READY</button>}
    </div>
    <p className="meta vatsim-responsibility">The official VATSIM form opens with the signed SimBrief ICAO plan already populated. Review it and press File Flight Plan; manual re-entry is not part of the HispaFly workflow.</p>
  </section>;
}
