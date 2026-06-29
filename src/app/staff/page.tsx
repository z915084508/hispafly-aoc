import { PageHeading } from "@/components/page-heading";
import { getDashboardSummary } from "@/lib/workflow-data";

const credits = (cents: number) => `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(cents / 100)} cr`;

export default async function StaffDashboard() {
  const summary = await getDashboardSummary();
  const stats = [["Ingresos de pasajeros del mes", credits(summary.passengerRevenueCents)], ["Vuelos aceptados este mes", String(summary.acceptedPireps)], ["Pasajeros transportados", summary.totalPassengers.toLocaleString("es-ES")], ["Nómina pendiente", credits(summary.pendingCents)], ["Coste virtual de nómina", credits(summary.totalCostCents)]];
  return <><PageHeading eyebrow="STAFF PORTAL · ADMIN" title="Panel AOC" copy="Actividad, ingresos de pasajeros y costes de nómina del mes actual." /><section className="grid stats">{stats.map(([label, value]) => <div className="card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>)}</section><section className="card workflow-card"><div className="card-header"><h2 className="card-title">Cola de trabajo</h2></div><div className="workflow-summary"><div><strong>{summary.pendingReviewCount}</strong><span>Pendientes de revisión</span></div><div><strong>{summary.approvedPaymentCount}</strong><span>Aprobadas para pago</span></div><div><strong>{summary.paidThisMonthCount}</strong><span>Pagadas este mes</span></div></div></section></>;
}
