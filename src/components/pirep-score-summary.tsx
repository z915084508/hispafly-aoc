import { object, finite } from "@/lib/pirep/scoring";
export function PirepScoreSummary({ score, details }: { score: number | null; details: unknown }) {
  const d = object(details);
  return <section className="card" aria-label="Flight score"><h2>FLIGHT SCORE · {score ?? "—"} / 100</h2>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
      <p>Operational / FOQA<br /><strong>{finite(d.operationalScore) ?? "—"} / 100</strong></p>
      <p>Efficiency<br /><strong>{finite(d.efficiencyScore) ?? "Unavailable"}</strong></p>
      <p>Weighted Final<br /><strong>{score ?? "—"} / 100</strong></p>
    </div><p>{finite(d.scoredEvents) ?? 0} Scored Events · {finite(d.reviewEvents) ?? 0} Review Events · {finite(d.dataQualityEvents) ?? 0} Data Quality Events</p>
  </section>;
}
