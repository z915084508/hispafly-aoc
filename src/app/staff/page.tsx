import { PageHeading } from "@/components/page-heading";
import { getDashboardSummary } from "@/lib/workflow-data";

const credits = (cents: number) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(cents / 100)} cr`;
const integer = (value: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);

export default async function StaffDashboard() {
  const summary = await getDashboardSummary();
  const stats = [
    ["Ingresos de pasajeros del mes", credits(summary.passengerRevenueCents), "PIREPs aceptados con revenue calculado"],
    ["Vuelos aceptados este mes", String(summary.acceptedPireps), "Fuente: vAMSYS Operations API"],
    ["Pasajeros transportados", integer(summary.totalPassengers), "Total mensual"],
    ["Nómina pendiente", credits(summary.pendingCents), "Pendiente de revisión"],
    ["Nómina aprobada", credits(summary.approvedCents), "Lista para pago"],
    ["Pagado este mes", credits(summary.paidCents), `${summary.paidThisMonthCount} pagos por fecha paidAt`],
    ["Pagado hoy", credits(summary.paidTodayCents), `${summary.paidTodayCount} pagos registrados hoy`],
    ["Coste virtual del periodo", credits(summary.totalCostCents), "Según mes de liquidación"],
  ];

  return <>
    <PageHeading eyebrow="STAFF PORTAL · ADMIN" title="Panel AOC" copy="Actividad, ingresos de pasajeros y costes de nómina del mes actual." />
    <section className="grid stats">
      {stats.map(([label, value, note]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>)}
    </section>
    <section className="card workflow-card">
      <div className="card-header"><h2 className="card-title">Cola de trabajo</h2><span className="meta">Estado actual</span></div>
      <div className="workflow-summary">
        <div><strong>{summary.pendingReviewCount}</strong><span>Pendientes de revisión</span></div>
        <div><strong>{summary.approvedPaymentCount}</strong><span>Aprobadas para pago</span></div>
        <div><strong>{summary.paidThisMonthCount}</strong><span>Pagadas este mes</span></div>
      </div>
    </section>
    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Top 5 pilotos por nómina pagada</h2><span className="meta">Mes actual · paidAt</span></div>
      {summary.topPilots.length === 0
        ? <div className="empty-state">Todavía no hay nóminas pagadas este mes.</div>
        : <div className="ranking-list">{summary.topPilots.map(([pilot, amount], index) => <div className="ranking-row" key={pilot}><span className="ranking-position">{index + 1}</span><span className="primary">{pilot}</span><strong>{credits(amount)}</strong></div>)}</div>}
    </section>
  </>;
}
