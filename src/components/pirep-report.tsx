import type { ReactNode } from "react";

export const formatMoney = (cents: number | null | undefined, currency = "EUR") =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);

export const formatNumber = (value: number | null | undefined) =>
  value == null ? "—" : new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);

export const formatMinutes = (value: number | null | undefined) =>
  value == null ? "—" : `${Math.floor(value / 60)} h ${String(value % 60).padStart(2, "0")} min`;

export const formatDateTime = (value: Date | null | undefined) =>
  value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";

export function PirepReportStyles() {
  return <style>{`
    .pirep-report { display: grid; gap: 18px; }
    .pirep-hero { position: relative; overflow: hidden; padding: 24px; color: white; background: linear-gradient(125deg, #111820 0%, #202b38 68%, #b80e17 140%); }
    .pirep-hero::after { content: ""; position: absolute; width: 260px; height: 260px; right: -100px; top: -140px; border: 36px solid rgba(255,255,255,.06); border-radius: 50%; }
    .pirep-route { display: flex; align-items: center; gap: 16px; font-size: clamp(28px, 5vw, 52px); font-weight: 850; letter-spacing: -.04em; }
    .pirep-route-line { width: min(170px, 20vw); height: 1px; background: rgba(255,255,255,.38); position: relative; }
    .pirep-route-line::after { content: "✈"; position: absolute; right: 42%; top: 50%; transform: translateY(-54%); font-size: 16px; }
    .pirep-hero-meta { display: flex; gap: 10px 22px; flex-wrap: wrap; margin-top: 12px; color: rgba(255,255,255,.72); font-size: 12px; }
    .pirep-section { padding: 0; overflow: hidden; }
    .pirep-section-title { margin: 0; padding: 13px 18px; color: white; background: #1d232b; font-size: 11px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; }
    .pirep-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .pirep-metric { min-height: 92px; padding: 17px 18px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .pirep-metric-label { color: var(--muted); font-size: 10px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
    .pirep-metric-value { margin-top: 8px; color: var(--ink); font-size: 19px; font-weight: 800; overflow-wrap: anywhere; }
    .pirep-metric-note { margin-top: 5px; color: var(--muted); font-size: 10px; }
    .pirep-economy-total { background: #f8fafc; }
    .pirep-economy-total .pirep-metric-value { font-size: 24px; }
    .pirep-positive { color: #08774e !important; }
    .pirep-negative { color: #b42318 !important; }
    .pirep-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .pirep-toolbar form { margin: 0; }
    .pirep-raw { padding: 18px; }
    .pirep-raw summary { cursor: pointer; font-weight: 800; }
    .pirep-raw pre { max-height: 520px; overflow: auto; margin: 14px 0 0; padding: 16px; border-radius: 10px; background: #111820; color: #d8e2ed; font: 11px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (max-width: 1050px) { .pirep-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 620px) { .pirep-metrics { grid-template-columns: 1fr; } .pirep-route { gap: 10px; } .pirep-route-line { width: 54px; } }
  `}</style>;
}

export function PirepHero({ departure, arrival, children }: { departure: string | null; arrival: string | null; children: ReactNode }) {
  return <section className="card pirep-hero">
    <div className="pirep-route"><span>{departure ?? "—"}</span><span className="pirep-route-line"/><span>{arrival ?? "—"}</span></div>
    <div className="pirep-hero-meta">{children}</div>
  </section>;
}

export function PirepSection({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`card pirep-section ${className}`}><h2 className="pirep-section-title">{title}</h2><div className="pirep-metrics">{children}</div></section>;
}

export function PirepMetric({ label, value, note, valueClassName = "" }: { label: string; value: ReactNode; note?: ReactNode; valueClassName?: string }) {
  return <div className="pirep-metric"><div className="pirep-metric-label">{label}</div><div className={`pirep-metric-value ${valueClassName}`}>{value}</div>{note && <div className="pirep-metric-note">{note}</div>}</div>;
}
