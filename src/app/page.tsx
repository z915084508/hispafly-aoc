import { PageHeading } from "@/components/page-heading";
import { getDashboardSummary } from "@/lib/workflow-data";

const credits = (cents: number) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(cents / 100)} cr`;

export default async function Dashboard() {
  const summary = await getDashboardSummary();
  const stats = [
    ["PIREPs aceptados este mes", String(summary.acceptedPireps), "Solo registros aceptados"],
    ["Nómina pendiente", credits(summary.pendingCents), "Pendiente de revisión"],
    ["Nómina aprobada", credits(summary.approvedCents), "Lista para pagar"],
    ["Nómina pagada", credits(summary.paidCents), "Abonada en carteras"],
    ["Coste virtual del mes", credits(summary.totalCostCents), "Total calculado"],
  ];
  return <>
    <PageHeading eyebrow="RESUMEN DE OPERACIONES" title="Panel AOC" copy="PIREPs aceptados, estado de nóminas y clasificación mensual." />
    <section className="grid stats">{stats.map(([label, value, note]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>)}</section>
    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Top 5 pilotos por nómina</h2><span className="meta">Mes actual</span></div>
      <div className="ranking-list">{summary.topPilots.map(([pilot, amount], index) => <div className="ranking-row" key={pilot}><span className="ranking-position">{index + 1}</span><span className="primary">{pilot}</span><strong>{credits(amount)}</strong></div>)}</div>
    </section>
  </>;
}