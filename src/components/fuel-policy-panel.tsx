type JsonRow = Record<string, unknown>;
const row = (value: unknown): JsonRow => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRow : {};
const value = (source: JsonRow, key: string, suffix = "") => source[key] === null || source[key] === undefined || source[key] === "" ? "—" : `${source[key]}${suffix}`;

export function FuelPolicyPanel({ snapshot }: { snapshot: unknown }) {
  const policy = row(snapshot), tankering = row(policy.tankering);
  const recommendedKg = Number(tankering.recommendedKg ?? 0);
  if (!Object.keys(policy).length) return null;
  return <section className="card">
    <div className="card-header"><div><h2 className="card-title">Fuel Policy Applied</h2><span className="meta">{value(policy, "name")} · {value(policy, "routeType")}</span></div></div>
    <div className="workflow-summary">
      <div><span>Contingency</span><strong>{value(policy, "contingencyRule")}</strong></div>
      <div><span>Final reserve</span><strong>{value(policy, "finalReserveRule", " min")}</strong></div>
      <div><span>Taxi fuel</span><strong>{value(policy, "taxiFuelKg", " kg")}</strong></div>
      <div><span>ATC fuel</span><strong>{value(policy, "atcFuelMinutes", " min")}</strong></div>
      <div><span>Weather fuel</span><strong>{value(policy, "weatherFuelMinutes", " min")}</strong></div>
      <div><span>MEL fuel</span><strong>{value(policy, "melFuelKg", " kg")}</strong></div>
      <div><span>Extra fuel</span><strong>{value(policy, "extraFuelKg", " kg")}</strong></div>
      <div><span>Tankering</span><strong>{recommendedKg > 0 ? `${recommendedKg} kg` : policy.tankeringAllowed ? "No recommendation" : "Not allowed"}</strong></div>
    </div>
    {recommendedKg > 0 && <div className="notice"><strong>Tankering recommendation:</strong> {recommendedKg} kg · Estimated saving €{(Number(tankering.estimatedSavingCents ?? 0) / 100).toFixed(2)}</div>}
  </section>;
}
